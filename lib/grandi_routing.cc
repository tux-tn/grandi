/*
**  Copyright (c) 2022 Dr. Ralf S. Engelschall <rse@engelschall.com>
**
**  Licensed under the Apache License, Version 2.0 (the "License");
**  you may not use this file except in compliance with the License.
**  You may obtain a copy of the License at
**
**    http://www.apache.org/licenses/LICENSE-2.0
**
**  Unless required by applicable law or agreed to in writing, software
**  distributed under the License is distributed on an "AS IS" BASIS,
**  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
**  See the License for the specific language governing permissions and
**  limitations under the License.
*/

/*  standard includes  */
#include <string>

/*  NDI API  */
#include <Processing.NDI.Lib.h>
#ifdef _WIN32
#ifdef _WIN64
#pragma comment(lib, "Processing.NDI.Lib.x64.lib")
#else // _WIN64
#pragma comment(lib, "Processing.NDI.Lib.x86.lib")
#endif // _WIN64
#endif // _WIN32

/*  own library API  */
#include "grandi_util.h"
#include "grandi_find.h"
#include "grandi_routing.h"

/*  own module API  */
napi_value routing_destroy(napi_env, napi_callback_info);
napi_value routing_change(napi_env, napi_callback_info);
napi_value routing_clear(napi_env, napi_callback_info);
napi_value routing_connections(napi_env, napi_callback_info);
napi_value routing_sourcename(napi_env, napi_callback_info);

void destroyRoutingInstance(void *value) {
  NDIlib_routing_destroy((NDIlib_routing_instance_t)value);
}

bool getRoutingInstanceFromThis(napi_env env, napi_value thisValue,
                                nativeHandle **handle,
                                NDIlib_routing_instance_t *routing) {
  napi_value embeddedValue;
  napi_status status =
      napi_get_named_property(env, thisValue, "embedded", &embeddedValue);
  if (status != napi_ok)
    return false;

  napi_valuetype type;
  status = napi_typeof(env, embeddedValue, &type);
  if (status != napi_ok)
    return false;
  if (type != napi_external) {
    napi_throw_error(env, nullptr, "Routing has been destroyed.");
    return false;
  }

  void *externalData;
  status = napi_get_value_external(env, embeddedValue, &externalData);
  if (status != napi_ok)
    return false;
  nativeHandle *native = (nativeHandle *)externalData;
  void *value;
  if (!acquireNativeHandle(native, &value)) {
    napi_throw_error(env, nullptr, "Routing has been destroyed.");
    return false;
  }

  *handle = native;
  *routing = (NDIlib_routing_instance_t)value;
  return true;
}

/*  callback for executing method routing()  */
void routingExecute(napi_env env, void *data) {
  routingCarrier *c = (routingCarrier *)data;
  NDIlib_routing_create_t routingConfig;
  routingConfig.p_ndi_name = c->name;
  routingConfig.p_groups = c->groups;
  c->routing = NDIlib_routing_create(&routingConfig);
  if (!c->routing) {
    c->status = GRANDI_ROUTING_CREATE_FAIL;
    c->errorMsg = "Failed to create NDI routing.";
    return;
  }
}

/*  callback for completing method routing()  */
void routingComplete(napi_env env, napi_status asyncStatus, void *data) {
  routingCarrier *c = (routingCarrier *)data;

  /*  check status  */
  if (asyncStatus != napi_ok) {
    c->status = asyncStatus;
    c->errorMsg = "Async routing creation failed to complete.";
  }
  REJECT_STATUS;

  /*  create result object  */
  napi_value result;
  c->status = napi_create_object(env, &result);
  REJECT_STATUS;

  /*  embed the native routing object  */
  napi_value embedded;
  nativeHandle *handle = createNativeHandle(c->routing, destroyRoutingInstance);
  c->status = napi_create_external(env, handle, finalizeNativeHandle, nullptr,
                                   &embedded);
  if (c->status != napi_ok) {
    closeNativeHandle(handle);
    delete handle;
    REJECT_STATUS;
  }
  c->status = napi_set_named_property(env, result, "embedded", embedded);
  REJECT_STATUS;

  /*  create "name" property  */
  napi_value name;
  if (c->name != nullptr) {
    c->status = napi_create_string_utf8(env, c->name, NAPI_AUTO_LENGTH, &name);
    REJECT_STATUS;
    c->status = napi_set_named_property(env, result, "name", name);
    REJECT_STATUS;
  }

  /*  create "groups" property  */
  napi_value groups;
  if (c->groups != nullptr) {
    c->status =
        napi_create_string_utf8(env, c->groups, NAPI_AUTO_LENGTH, &groups);
    REJECT_STATUS;
    c->status = napi_set_named_property(env, result, "groups", groups);
    REJECT_STATUS;
  }

  /*  attach the "destroy()" method  */
  napi_value fn;
  c->status = napi_create_function(env, "destroy", NAPI_AUTO_LENGTH,
                                   routing_destroy, nullptr, &fn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "destroy", fn);
  REJECT_STATUS;

  /*  attach the "change()" method  */
  c->status = napi_create_function(env, "change", NAPI_AUTO_LENGTH,
                                   routing_change, nullptr, &fn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "change", fn);
  REJECT_STATUS;

  /*  attach the "clear()" method  */
  c->status = napi_create_function(env, "clear", NAPI_AUTO_LENGTH,
                                   routing_clear, nullptr, &fn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "clear", fn);
  REJECT_STATUS;

  /*  attach the "connections()" method  */
  c->status = napi_create_function(env, "connections", NAPI_AUTO_LENGTH,
                                   routing_connections, nullptr, &fn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "connections", fn);
  REJECT_STATUS;

  /*  attach the "sourcename()" method  */
  c->status = napi_create_function(env, "sourcename", NAPI_AUTO_LENGTH,
                                   routing_sourcename, nullptr, &fn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "sourcename", fn);
  REJECT_STATUS;

  /*  resolve the promise  */
  napi_status status;
  status = napi_resolve_deferred(env, c->_deferred, result);
  FLOATING_STATUS;

  /*  cleanup  */
  tidyCarrier(env, c);
}

/*  the API method "routing()"  */
napi_value routing(napi_env env, napi_callback_info info) {
  routingCarrier *c = new routingCarrier;
  napi_valuetype type;

  /*  create result promise  */
  napi_value promise;
  c->status = napi_create_promise(env, &c->_deferred, &promise);
  REJECT_RETURN;

  /*  fetch argument  */
  size_t argc = 1;
  napi_value args[1];
  c->status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  REJECT_RETURN;
  if (argc != (size_t)1)
    REJECT_ERROR_RETURN("Routing must be created with an object.",
                        GRANDI_INVALID_ARGS);
  c->status = napi_typeof(env, args[0], &type);
  REJECT_RETURN;
  bool isArray;
  c->status = napi_is_array(env, args[0], &isArray);
  REJECT_RETURN;
  if ((type != napi_object) || isArray)
    REJECT_ERROR_RETURN("Single argument must be an object, not an array.",
                        GRANDI_INVALID_ARGS);
  napi_value config = args[0];

  /*  fetch "name" property  */
  napi_value name;
  c->status = napi_get_named_property(env, config, "name", &name);
  REJECT_RETURN;
  c->status = napi_typeof(env, name, &type);
  if (type != napi_undefined) {
    if (type != napi_string)
      REJECT_ERROR_RETURN(
          "Optional name property must be a string when present.",
          GRANDI_INVALID_ARGS);
    size_t namel;
    c->status = napi_get_value_string_utf8(env, name, nullptr, 0, &namel);
    REJECT_RETURN;
    c->name = (char *)malloc(namel + 1);
    c->status =
        napi_get_value_string_utf8(env, name, c->name, namel + 1, &namel);
    REJECT_RETURN;
  }

  /*  fetch "groups" property  */
  napi_value groups;
  c->status = napi_get_named_property(env, config, "groups", &groups);
  REJECT_RETURN;
  c->status = napi_typeof(env, groups, &type);
  if (type != napi_undefined) {
    if (type != napi_string)
      REJECT_ERROR_RETURN(
          "Optional groups property must be a string when present.",
          GRANDI_INVALID_ARGS);
    size_t groupsl;
    c->status = napi_get_value_string_utf8(env, groups, nullptr, 0, &groupsl);
    REJECT_RETURN;
    c->groups = (char *)malloc(groupsl + 1);
    c->status = napi_get_value_string_utf8(env, groups, c->groups, groupsl + 1,
                                           &groupsl);
    REJECT_RETURN;
  }

  /*  create an internal async resource  */
  napi_value resource_name;
  c->status =
      napi_create_string_utf8(env, "Routing", NAPI_AUTO_LENGTH, &resource_name);
  REJECT_RETURN;
  c->status = napi_create_async_work(env, NULL, resource_name, routingExecute,
                                     routingComplete, c, &c->_request);
  REJECT_RETURN;
  c->status = napi_queue_async_work(env, c->_request);
  REJECT_RETURN;

  return promise;
}

/*  API method "routing.destroy()"  */
napi_value routing_destroy(napi_env env, napi_callback_info info) {
  bool success = false;
  napi_value thisValue;
  size_t argc = 0;
  if (napi_get_cb_info(env, info, &argc, nullptr, &thisValue, nullptr) !=
      napi_ok)
    goto done;

  napi_value embeddedValue;
  if (napi_get_named_property(env, thisValue, "embedded", &embeddedValue) !=
      napi_ok)
    goto done;

  napi_valuetype type;
  if (napi_typeof(env, embeddedValue, &type) != napi_ok)
    goto done;

  if (type == napi_external) {
    void *externalData;
    if (napi_get_value_external(env, embeddedValue, &externalData) != napi_ok)
      goto done;
    success = closeNativeHandle((nativeHandle *)externalData);

    napi_value value;
    if (napi_create_int32(env, 0, &value) == napi_ok)
      napi_set_named_property(env, thisValue, "embedded", value);
  }

done:
  napi_value result;
  if (napi_get_boolean(env, success, &result) != napi_ok)
    napi_get_boolean(env, false, &result);
  return result;
}

/*  API method "routing.change()"  */
napi_value routing_change(napi_env env, napi_callback_info info) {
  napi_status status;

  /*  fetch arguments  */
  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  CHECK_STATUS;

  /*  fetch embedded NDI native routing object  */
  nativeHandle *handle;
  NDIlib_routing_instance_t routing;
  if (!getRoutingInstanceFromThis(env, thisValue, &handle, &routing))
    return nullptr;
  nativeHandleGuard guard(handle);

  /*  fetch source argument  */
  if (argc != (size_t)1)
    NAPI_THROW_ERROR("Missing source argument");
  napi_value source = args[0];
  napi_valuetype type;
  status = napi_typeof(env, source, &type);
  CHECK_STATUS;
  if (type == napi_null || type == napi_undefined) {
    bool cleared = NDIlib_routing_clear(routing);
    napi_value clearedValue;
    status = napi_get_boolean(env, cleared, &clearedValue);
    CHECK_STATUS;
    return clearedValue;
  }
  bool isArray;
  status = napi_is_array(env, source, &isArray);
  CHECK_STATUS;
  if ((type != napi_object) || isArray)
    NAPI_THROW_ERROR("Source property must be an object and not an array.")

  /*  check source's name argument  */
  napi_value checkType;
  status = napi_get_named_property(env, source, "name", &checkType);
  CHECK_STATUS;
  status = napi_typeof(env, checkType, &type);
  CHECK_STATUS;
  if (type != napi_string)
    NAPI_THROW_ERROR("Source property must have a 'name' sub-property that is "
                     "of type string.")

  /*  check source's urlAddress argument  */
  status = napi_get_named_property(env, source, "urlAddress", &checkType);
  CHECK_STATUS;
  status = napi_typeof(env, checkType, &type);
  CHECK_STATUS;
  if (type != napi_undefined && type != napi_string)
    NAPI_THROW_ERROR("Source 'urlAddress' sub-property must be of type string.")

  /*  create NDI native source object  */
  NDIlib_source_t ndi_source{};
  status = makeNativeSource(env, source, &ndi_source);
  CHECK_STATUS;

  /*  call NDI API functionality  */
  int ok = NDIlib_routing_change(routing, &ndi_source);

  /*  cleanup resource  */
  freeNativeSource(&ndi_source);

  /*  return a boolean result  */
  napi_value result;
  status = napi_get_boolean(env, ok, &result);
  CHECK_STATUS;

  return result;
}

/*  API method "routing.clear()"  */
napi_value routing_clear(napi_env env, napi_callback_info info) {
  napi_status status;

  /*  fetch arguments  */
  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  CHECK_STATUS;

  /*  fetch embedded NDI native routing object  */
  nativeHandle *handle;
  NDIlib_routing_instance_t routing;
  if (!getRoutingInstanceFromThis(env, thisValue, &handle, &routing))
    return nullptr;
  nativeHandleGuard guard(handle);

  /*  call NDI API functionality  */
  int ok = NDIlib_routing_clear(routing);

  /*  return a boolean result  */
  napi_value result;
  status = napi_get_boolean(env, ok, &result);
  CHECK_STATUS;

  return result;
}

/*  API method "routing.connections()"  */
napi_value routing_connections(napi_env env, napi_callback_info info) {
  napi_status status;

  /*  fetch arguments  */
  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  CHECK_STATUS;

  /*  fetch embedded NDI native routing object  */
  nativeHandle *handle;
  NDIlib_routing_instance_t routing;
  if (!getRoutingInstanceFromThis(env, thisValue, &handle, &routing))
    return nullptr;
  nativeHandleGuard guard(handle);

  /*  call NDI API functionality  */
  int conns = NDIlib_routing_get_no_connections(routing, 0);

  /*  return a numeric result  */
  napi_value result;
  status = napi_create_int32(env, (int32_t)conns, &result);
  CHECK_STATUS;

  return result;
}

/*  API method "routing.sourcename()"  */
napi_value routing_sourcename(napi_env env, napi_callback_info info) {
  napi_status status;

  /*  fetch arguments  */
  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  CHECK_STATUS;

  /*  fetch embedded NDI native routing object  */
  nativeHandle *handle;
  NDIlib_routing_instance_t routing;
  if (!getRoutingInstanceFromThis(env, thisValue, &handle, &routing))
    return nullptr;
  nativeHandleGuard guard(handle);

  /*  call NDI API functionality  */
  const NDIlib_source_t *source = NDIlib_routing_get_source_name(routing);

  /*  return a string result  */
  napi_value result;
  status = napi_create_string_utf8(env, source->p_ndi_name, NAPI_AUTO_LENGTH,
                                   &result);
  CHECK_STATUS;

  return result;
}
