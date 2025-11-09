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

/*  wrapper structure for embedded value  */
typedef struct embeddedValue
{
    void *value;
} embeddedValue_t;

/*  callback for destroying embedded value  */
void finalizeRouting(napi_env env, void *data, void *hint)
{
    embeddedValue_t *embeddedValue = (embeddedValue_t *)data;
    if (embeddedValue != nullptr)
    {
        NDIlib_routing_instance_t routing = (NDIlib_routing_instance_t)(embeddedValue->value);
        if (routing != nullptr)
            NDIlib_routing_destroy(routing);
        embeddedValue->value = nullptr;
    }
    free(data);
}

/*  callback for executing method routing()  */
void routingExecute(napi_env env, void *data)
{
    routingCarrier *c = (routingCarrier *)data;
    NDIlib_routing_create_t routingConfig;
    routingConfig.p_ndi_name = c->name;
    routingConfig.p_groups = c->groups;
    c->routing = NDIlib_routing_create(&routingConfig);
    if (!c->routing)
    {
        c->status = GRANDI_ROUTING_CREATE_FAIL;
        c->errorMsg = "Failed to create NDI routing.";
        return;
    }
}

/*  callback for completing method routing()  */
void routingComplete(napi_env env, napi_status asyncStatus, void *data)
{
    routingCarrier *c = (routingCarrier *)data;

    /*  check status  */
    if (asyncStatus != napi_ok)
    {
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
    embeddedValue_t *embeddedValue = (embeddedValue_t *)malloc(sizeof(embeddedValue_t));
    embeddedValue->value = c->routing;
    c->status = napi_create_external(env, embeddedValue, finalizeRouting, nullptr, &embedded);
    REJECT_STATUS;
    c->status = napi_set_named_property(env, result, "embedded", embedded);
    REJECT_STATUS;

    /*  create "name" property  */
    napi_value name;
    if (c->name != nullptr)
    {
        c->status = napi_create_string_utf8(env, c->name, NAPI_AUTO_LENGTH, &name);
        REJECT_STATUS;
        c->status = napi_set_named_property(env, result, "name", name);
        REJECT_STATUS;
    }

    /*  create "groups" property  */
    napi_value groups;
    if (c->groups != nullptr)
    {
        c->status = napi_create_string_utf8(env, c->groups, NAPI_AUTO_LENGTH, &groups);
        REJECT_STATUS;
        c->status = napi_set_named_property(env, result, "groups", groups);
        REJECT_STATUS;
    }

    /*  attach the "destroy()" method  */
    napi_value fn;
    c->status = napi_create_function(env, "destroy", NAPI_AUTO_LENGTH, routing_destroy, nullptr, &fn);
    REJECT_STATUS;
    c->status = napi_set_named_property(env, result, "destroy", fn);
    REJECT_STATUS;

    /*  attach the "change()" method  */
    c->status = napi_create_function(env, "change", NAPI_AUTO_LENGTH, routing_change, nullptr, &fn);
    REJECT_STATUS;
    c->status = napi_set_named_property(env, result, "change", fn);
    REJECT_STATUS;

    /*  attach the "clear()" method  */
    c->status = napi_create_function(env, "clear", NAPI_AUTO_LENGTH, routing_clear, nullptr, &fn);
    REJECT_STATUS;
    c->status = napi_set_named_property(env, result, "clear", fn);
    REJECT_STATUS;

    /*  attach the "connections()" method  */
    c->status = napi_create_function(env, "connections", NAPI_AUTO_LENGTH, routing_connections, nullptr, &fn);
    REJECT_STATUS;
    c->status = napi_set_named_property(env, result, "connections", fn);
    REJECT_STATUS;

    /*  attach the "sourcename()" method  */
    c->status = napi_create_function(env, "sourcename", NAPI_AUTO_LENGTH, routing_sourcename, nullptr, &fn);
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
napi_value routing(napi_env env, napi_callback_info info)
{
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
        REJECT_ERROR_RETURN("Routing must be created with an object.", GRANDI_INVALID_ARGS);
    c->status = napi_typeof(env, args[0], &type);
    REJECT_RETURN;
    bool isArray;
    c->status = napi_is_array(env, args[0], &isArray);
    REJECT_RETURN;
    if ((type != napi_object) || isArray)
        REJECT_ERROR_RETURN("Single argument must be an object, not an array.", GRANDI_INVALID_ARGS);
    napi_value config = args[0];

    /*  fetch "name" property  */
    napi_value name;
    c->status = napi_get_named_property(env, config, "name", &name);
    REJECT_RETURN;
    c->status = napi_typeof(env, name, &type);
    if (type != napi_undefined)
    {
        if (type != napi_string)
            REJECT_ERROR_RETURN("Optional name property must be a string when present.", GRANDI_INVALID_ARGS);
        size_t namel;
        c->status = napi_get_value_string_utf8(env, name, nullptr, 0, &namel);
        REJECT_RETURN;
        c->name = (char *)malloc(namel + 1);
        c->status = napi_get_value_string_utf8(env, name, c->name, namel + 1, &namel);
        REJECT_RETURN;
    }

    /*  fetch "groups" property  */
    napi_value groups;
    c->status = napi_get_named_property(env, config, "groups", &groups);
    REJECT_RETURN;
    c->status = napi_typeof(env, groups, &type);
    if (type != napi_undefined)
    {
        if (type != napi_string)
            REJECT_ERROR_RETURN("Optional groups property must be a string when present.", GRANDI_INVALID_ARGS);
        size_t groupsl;
        c->status = napi_get_value_string_utf8(env, groups, nullptr, 0, &groupsl);
        REJECT_RETURN;
        c->groups = (char *)malloc(groupsl + 1);
        c->status = napi_get_value_string_utf8(env, groups, c->groups, groupsl + 1, &groupsl);
        REJECT_RETURN;
    }

    /*  create an internal async resource  */
    napi_value resource_name;
    c->status = napi_create_string_utf8(env, "Routing", NAPI_AUTO_LENGTH, &resource_name);
    REJECT_RETURN;
    c->status = napi_create_async_work(env, NULL, resource_name, routingExecute, routingComplete, c, &c->_request);
    REJECT_RETURN;
    c->status = napi_queue_async_work(env, c->_request);
    REJECT_RETURN;

    return promise;
}

/*  API method "routing.destroy()"  */
napi_value routing_destroy(napi_env env, napi_callback_info info)
{
    /*  create a new Promise carrier object  */
    carrier *c = new carrier;
    napi_value promise;
    c->status = napi_create_promise(env, &c->_deferred, &promise);
    REJECT_RETURN;

    /*  fetch the NDI routing wrapper object ("this" of the "destroy" method)  */
    size_t argc = 1;
    napi_value args[1];
    napi_value thisValue;
    c->status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
    REJECT_RETURN;

    /*  fetch NDI routing external object  */
    napi_value embeddedValue;
    c->status = napi_get_named_property(env, thisValue, "embedded", &embeddedValue);
    REJECT_RETURN;

    /*  ensure it was still not manually destroyed  */
    napi_valuetype result;
    if (napi_typeof(env, embeddedValue, &result) != napi_ok)
        NAPI_THROW_ERROR("NDI routing already destroyed");
    if (result == napi_external)
    {
        /*  fetch NDI routing native object  */
        embeddedValue_t *embeddedData;
        c->status = napi_get_value_external(env, embeddedValue, (void **)&embeddedData);
        REJECT_RETURN;
        NDIlib_routing_instance_t routing = (NDIlib_routing_instance_t)(embeddedData->value);

        /*  call the NDI API  */
        NDIlib_routing_destroy(routing);

        /*  indicate to finalizeRouting that the NDI routing native object is already destroyed  */
        embeddedData->value = nullptr;
        REJECT_RETURN;
    }

    /*  resolve promise  */
    napi_value undefined;
    napi_get_undefined(env, &undefined);
    napi_resolve_deferred(env, c->_deferred, undefined);

    return promise;
}

/*  API method "routing.change()"  */
napi_value routing_change(napi_env env, napi_callback_info info)
{
    napi_status status;

    /*  fetch arguments  */
    size_t argc = 1;
    napi_value args[1];
    napi_value thisValue;
    status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
    CHECK_STATUS;

    /*  fetch embedded NDI native routing object  */
    napi_value embeddedValue;
    status = napi_get_named_property(env, thisValue, "embedded", &embeddedValue);
    CHECK_STATUS;
    embeddedValue_t *embeddedData;
    status = napi_get_value_external(env, embeddedValue, (void **)&embeddedData);
    CHECK_STATUS;
    NDIlib_routing_instance_t routing = (NDIlib_routing_instance_t)(embeddedData->value);

    /*  fetch source argument  */
    if (argc != (size_t)1)
        NAPI_THROW_ERROR("Missing source argument");
    napi_value source = args[0];
    napi_valuetype type;
    status = napi_typeof(env, source, &type);
    CHECK_STATUS;
    if (type == napi_null || type == napi_undefined)
    {
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
        NAPI_THROW_ERROR("Source property must have a 'name' sub-property that is of type string.")

    /*  check source's urlAddress argument  */
    status = napi_get_named_property(env, source, "urlAddress", &checkType);
    CHECK_STATUS;
    status = napi_typeof(env, checkType, &type);
    CHECK_STATUS;
    if (type != napi_undefined && type != napi_string)
        NAPI_THROW_ERROR("Source 'urlAddress' sub-property must be of type string.")

    /*  create NDI native source object  */
    NDIlib_source_t *ndi_source = new NDIlib_source_t();
    status = makeNativeSource(env, source, ndi_source);
    CHECK_STATUS;

    /*  call NDI API functionality  */
    int ok = NDIlib_routing_change(routing, ndi_source);

    /*  cleanup resource  */
    freeNativeSource(ndi_source);
    delete ndi_source;

    /*  return a boolean result  */
    napi_value result;
    status = napi_get_boolean(env, ok, &result);
    CHECK_STATUS;

    return result;
}

/*  API method "routing.clear()"  */
napi_value routing_clear(napi_env env, napi_callback_info info)
{
    napi_status status;

    /*  fetch arguments  */
    size_t argc = 1;
    napi_value args[1];
    napi_value thisValue;
    status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
    CHECK_STATUS;

    /*  fetch embedded NDI native routing object  */
    napi_value embeddedValue;
    status = napi_get_named_property(env, thisValue, "embedded", &embeddedValue);
    CHECK_STATUS;
    embeddedValue_t *embeddedData;
    status = napi_get_value_external(env, embeddedValue, (void **)&embeddedData);
    CHECK_STATUS;
    NDIlib_routing_instance_t routing = (NDIlib_routing_instance_t)(embeddedData->value);

    /*  call NDI API functionality  */
    int ok = NDIlib_routing_clear(routing);

    /*  return a boolean result  */
    napi_value result;
    status = napi_get_boolean(env, ok, &result);
    CHECK_STATUS;

    return result;
}

/*  API method "routing.connections()"  */
napi_value routing_connections(napi_env env, napi_callback_info info)
{
    napi_status status;

    /*  fetch arguments  */
    size_t argc = 1;
    napi_value args[1];
    napi_value thisValue;
    status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
    CHECK_STATUS;

    /*  fetch embedded NDI native routing object  */
    napi_value embeddedValue;
    status = napi_get_named_property(env, thisValue, "embedded", &embeddedValue);
    CHECK_STATUS;
    embeddedValue_t *embeddedData;
    status = napi_get_value_external(env, embeddedValue, (void **)&embeddedData);
    CHECK_STATUS;
    NDIlib_routing_instance_t routing = (NDIlib_routing_instance_t)(embeddedData->value);

    /*  call NDI API functionality  */
    int conns = NDIlib_routing_get_no_connections(routing, 0);

    /*  return a numeric result  */
    napi_value result;
    status = napi_create_int32(env, (int32_t)conns, &result);
    CHECK_STATUS;

    return result;
}

/*  API method "routing.sourcename()"  */
napi_value routing_sourcename(napi_env env, napi_callback_info info)
{
    napi_status status;

    /*  fetch arguments  */
    size_t argc = 1;
    napi_value args[1];
    napi_value thisValue;
    status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
    CHECK_STATUS;

    /*  fetch embedded NDI native routing object  */
    napi_value embeddedValue;
    status = napi_get_named_property(env, thisValue, "embedded", &embeddedValue);
    CHECK_STATUS;
    embeddedValue_t *embeddedData;
    status = napi_get_value_external(env, embeddedValue, (void **)&embeddedData);
    CHECK_STATUS;
    NDIlib_routing_instance_t routing = (NDIlib_routing_instance_t)(embeddedData->value);

    /*  call NDI API functionality  */
    const NDIlib_source_t *source = NDIlib_routing_get_source_name(routing);

    /*  return a string result  */
    napi_value result;
    status = napi_create_string_utf8(env, source->p_ndi_name, NAPI_AUTO_LENGTH, &result);
    CHECK_STATUS;

    return result;
}
