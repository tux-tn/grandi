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

/*  own module API  */
napi_value find_destroy(napi_env, napi_callback_info);
napi_value find_sources(napi_env, napi_callback_info);
napi_value find_wait(napi_env, napi_callback_info);

void destroyFindInstance(void *value) {
  NDIlib_find_destroy((NDIlib_find_instance_t)value);
}

bool acquireFindFromThis(napi_env env, napi_value thisValue,
                         nativeHandle **handle, NDIlib_find_instance_t *find,
                         carrier *c) {
  napi_value embedded;
  c->status = napi_get_named_property(env, thisValue, "embedded", &embedded);
  if (c->status != napi_ok)
    return false;
  napi_valuetype type;
  c->status = napi_typeof(env, embedded, &type);
  if (c->status != napi_ok)
    return false;
  if (type != napi_external) {
    c->status = GRANDI_INVALID_ARGS;
    c->errorMsg = "Finder has been destroyed.";
    return false;
  }
  void *externalData;
  c->status = napi_get_value_external(env, embedded, &externalData);
  if (c->status != napi_ok)
    return false;
  nativeHandle *native = (nativeHandle *)externalData;
  void *value;
  if (!acquireNativeHandle(native, &value)) {
    c->status = GRANDI_INVALID_ARGS;
    c->errorMsg = "Finder has been destroyed.";
    return false;
  }
  *handle = native;
  *find = (NDIlib_find_instance_t)value;
  return true;
}

/*  callback for executing method find()  */
void findExecute(napi_env env, void *data) {
  findCarrier *c = (findCarrier *)data;
  NDIlib_find_create_t findConfig;
  findConfig.show_local_sources = c->show_local_sources;
  findConfig.p_groups = c->groups;
  findConfig.p_extra_ips = c->extra_ips;
  c->find = NDIlib_find_create_v2(&findConfig);
  if (!c->find) {
    c->status = GRANDI_FIND_CREATE_FAIL;
    c->errorMsg = "Failed to create NDI find instance.";
    return;
  }
}

/*  callback for completing method find()  */
void findComplete(napi_env env, napi_status asyncStatus, void *data) {
  findCarrier *c = (findCarrier *)data;

  /*  check status  */
  if (asyncStatus != napi_ok) {
    c->status = asyncStatus;
    c->errorMsg = "Async find instance creation failed to complete.";
  }
  REJECT_STATUS;

  /*  create result object  */
  napi_value result;
  c->status = napi_create_object(env, &result);
  REJECT_STATUS;

  /*  embed the native find object  */
  napi_value embedded;
  nativeHandle *handle = createNativeHandle(c->find, destroyFindInstance);
  c->status = napi_create_external(env, handle, finalizeNativeHandle, nullptr,
                                   &embedded);
  if (c->status != napi_ok) {
    closeNativeHandle(handle);
    delete handle;
    REJECT_STATUS;
  }
  c->status = napi_set_named_property(env, result, "embedded", embedded);
  REJECT_STATUS;

  /*  attach the "destroy()" method  */
  napi_value fn;
  c->status = napi_create_function(env, "destroy", NAPI_AUTO_LENGTH,
                                   find_destroy, nullptr, &fn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "destroy", fn);
  REJECT_STATUS;

  /*  attach the "sources()" method  */
  c->status = napi_create_function(env, "sources", NAPI_AUTO_LENGTH,
                                   find_sources, nullptr, &fn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "sources", fn);
  REJECT_STATUS;

  /*  attach the "wait()" method  */
  c->status = napi_create_function(env, "wait", NAPI_AUTO_LENGTH, find_wait,
                                   nullptr, &fn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "wait", fn);
  REJECT_STATUS;

  /*  resolve the promise  */
  napi_status status;
  status = napi_resolve_deferred(env, c->_deferred, result);
  FLOATING_STATUS;

  /*  cleanup  */
  tidyCarrier(env, c);
}

/*  the API method "find()"  */
napi_value find(napi_env env, napi_callback_info info) {
  findCarrier *c = new findCarrier;
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
    REJECT_ERROR_RETURN("Find must be created with an object.",
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

  /*  fetch "showLocalSources" property  */
  napi_value showLocalSources;
  c->status = napi_get_named_property(env, config, "showLocalSources",
                                      &showLocalSources);
  REJECT_RETURN;
  c->status = napi_typeof(env, showLocalSources, &type);
  if (type != napi_undefined) {
    if (type != napi_boolean)
      REJECT_ERROR_RETURN(
          "Optional showLocalSources property must be a boolean when present.",
          GRANDI_INVALID_ARGS);
    c->status =
        napi_get_value_bool(env, showLocalSources, &c->show_local_sources);
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

  /*  fetch "extraIPs" property  */
  napi_value extraIPs;
  c->status = napi_get_named_property(env, config, "extraIPs", &extraIPs);
  REJECT_RETURN;
  c->status = napi_typeof(env, extraIPs, &type);
  if (type != napi_undefined) {
    if (type != napi_string)
      REJECT_ERROR_RETURN(
          "Optional extraIPs property must be a string when present.",
          GRANDI_INVALID_ARGS);
    size_t extraIPsl;
    c->status =
        napi_get_value_string_utf8(env, extraIPs, nullptr, 0, &extraIPsl);
    REJECT_RETURN;
    c->extra_ips = (char *)malloc(extraIPsl + 1);
    c->status = napi_get_value_string_utf8(env, extraIPs, c->extra_ips,
                                           extraIPsl + 1, &extraIPsl);
    REJECT_RETURN;
  }

  /*  create an internal async resource  */
  napi_value resource_name;
  c->status =
      napi_create_string_utf8(env, "Find", NAPI_AUTO_LENGTH, &resource_name);
  REJECT_RETURN;
  c->status = napi_create_async_work(env, NULL, resource_name, findExecute,
                                     findComplete, c, &c->_request);
  REJECT_RETURN;
  c->status = napi_queue_async_work(env, c->_request);
  REJECT_RETURN;

  return promise;
}

/*  API method "find.destroy()"  */
napi_value find_destroy(napi_env env, napi_callback_info info) {
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

/*  API method "find.sources()"  */
napi_value find_sources(napi_env env, napi_callback_info info) {
  napi_status status;

  /*  fetch arguments  */
  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  CHECK_STATUS;

  /*  fetch embedded NDI native find object  */
  carrier c;
  nativeHandle *handle = nullptr;
  NDIlib_find_instance_t find = nullptr;
  if (!acquireFindFromThis(env, thisValue, &handle, &find, &c)) {
    if (c.status >= GRANDI_ERROR_START)
      napi_throw_error(env, nullptr, c.errorMsg.c_str());
    else {
      status = (napi_status)c.status;
      CHECK_STATUS;
    }
    return nullptr;
  }
  nativeHandleGuard guard(handle);

  /*  call NDI API functionality  */
  uint32_t no_sources;
  const NDIlib_source_t *sources =
      NDIlib_find_get_current_sources(find, &no_sources);

  /*  return result  */
  napi_value result;
  status = napi_create_array(env, &result);
  CHECK_STATUS;
  napi_value item;
  for (uint32_t i = 0; i < no_sources; i++) {
    napi_value name, uri;
    status = napi_create_string_utf8(env, sources[i].p_ndi_name,
                                     NAPI_AUTO_LENGTH, &name);
    CHECK_STATUS;
    if (sources[i].p_url_address != nullptr) {
      status = napi_create_string_utf8(env, sources[i].p_url_address,
                                       NAPI_AUTO_LENGTH, &uri);
      CHECK_STATUS;
    } else {
      status = napi_get_null(env, &uri);
      CHECK_STATUS;
    }
    status = napi_create_object(env, &item);
    CHECK_STATUS;
    status = napi_set_named_property(env, item, "name", name);
    CHECK_STATUS;
    status = napi_set_named_property(env, item, "urlAddress", uri);
    CHECK_STATUS;
    status = napi_set_element(env, result, i, item);
    CHECK_STATUS;
  }

  return result;
}

void findWaitExecute(napi_env env, void *data) {
  findWaitCarrier *c = (findWaitCarrier *)data;
  c->changed = NDIlib_find_wait_for_sources(c->find, c->wait);
}

void findWaitComplete(napi_env env, napi_status asyncStatus, void *data) {
  findWaitCarrier *c = (findWaitCarrier *)data;
  if (asyncStatus != napi_ok) {
    c->status = asyncStatus;
    c->errorMsg = "Async finder wait failed to complete.";
  }
  REJECT_STATUS;

  napi_value result;
  c->status = napi_get_boolean(env, c->changed, &result);
  REJECT_STATUS;
  napi_status status = napi_resolve_deferred(env, c->_deferred, result);
  FLOATING_STATUS;
  tidyCarrier(env, c);
}

/*  API method "find.wait()"  */
napi_value find_wait(napi_env env, napi_callback_info info) {
  findWaitCarrier *c = new findWaitCarrier;

  napi_value promise;
  c->status = napi_create_promise(env, &c->_deferred, &promise);
  REJECT_RETURN;

  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  c->status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  REJECT_RETURN;

  if (!acquireFindFromThis(env, thisValue, &c->handle, &c->find, c))
    REJECT_RETURN;

  if (argc >= 1) {
    napi_valuetype type;
    c->status = napi_typeof(env, args[0], &type);
    REJECT_RETURN;
    if (type != napi_undefined) {
      c->status =
          parseUint32Value(env, args[0], "timeoutMs", &c->wait, &c->errorMsg);
      REJECT_RETURN;
      if (!c->errorMsg.empty())
        REJECT_ERROR_RETURN(c->errorMsg, GRANDI_INVALID_ARGS);
    }
  }

  napi_value resourceName;
  c->status = napi_create_string_utf8(env, "FinderWait", NAPI_AUTO_LENGTH,
                                      &resourceName);
  REJECT_RETURN;
  c->status =
      napi_create_async_work(env, nullptr, resourceName, findWaitExecute,
                             findWaitComplete, c, &c->_request);
  REJECT_RETURN;
  c->status = napi_queue_async_work(env, c->_request);
  REJECT_RETURN;

  return promise;
}
