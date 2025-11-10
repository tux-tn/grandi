/* Copyright 2018 Streampunk Media Ltd.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

#include <string>
#include <Processing.NDI.Lib.h>

#ifdef _WIN32
#ifdef _WIN64
#pragma comment(lib, "Processing.NDI.Lib.x64.lib")
#else // _WIN64
#pragma comment(lib, "Processing.NDI.Lib.x86.lib")
#endif // _WIN64
#endif // _WIN32

#include "grandi_send.h"
#include "grandi_util.h"

napi_value videoSend(napi_env env, napi_callback_info info);
napi_value audioSend(napi_env env, napi_callback_info info);
napi_value connections(napi_env env, napi_callback_info info);
napi_value metadataSend(napi_env env, napi_callback_info info);
napi_value tally(napi_env env, napi_callback_info info);
napi_value sourcename(napi_env env, napi_callback_info info);

namespace
{
  bool getInt64FromValue(napi_env env, napi_value value, int64_t *out, carrier *c, const char *propName)
  {
    napi_valuetype type;
    c->status = napi_typeof(env, value, &type);
    if (c->status != napi_ok)
      return false;
    if (type == napi_number)
    {
      c->status = napi_get_value_int64(env, value, out);
      return c->status == napi_ok;
    }
    if (type == napi_bigint)
    {
      bool lossless;
      c->status = napi_get_value_bigint_int64(env, value, out, &lossless);
      return c->status == napi_ok;
    }
    c->errorMsg = std::string(propName) + " value must be a number, bigint, or a [seconds,nanoseconds] tuple.";
    c->status = GRANDI_INVALID_ARGS;
    return false;
  }

  bool parsePtpTimestampArray(napi_env env, napi_value value, int64_t *out, carrier *c, const char *propName)
  {
    bool isArray;
    c->status = napi_is_array(env, value, &isArray);
    if (c->status != napi_ok)
      return false;
    if (!isArray)
    {
      c->errorMsg = std::string(propName) + " value must be a [seconds,nanoseconds] array.";
      c->status = GRANDI_INVALID_ARGS;
      return false;
    }

    uint32_t length;
    c->status = napi_get_array_length(env, value, &length);
    if (c->status != napi_ok)
      return false;
    if (length < 2)
    {
      c->errorMsg = std::string(propName) + " array must contain two numeric entries.";
      c->status = GRANDI_INVALID_ARGS;
      return false;
    }

    napi_value secsValue, nanosValue;
    c->status = napi_get_element(env, value, 0, &secsValue);
    if (c->status != napi_ok)
      return false;
    c->status = napi_get_element(env, value, 1, &nanosValue);
    if (c->status != napi_ok)
      return false;

    int64_t seconds = 0;
    if (!getInt64FromValue(env, secsValue, &seconds, c, propName))
      return false;

    int64_t nanos = 0;
    if (!getInt64FromValue(env, nanosValue, &nanos, c, propName))
      return false;

    int64_t hundredNsFromSeconds = seconds * 10000000LL;
    int64_t hundredNsFromNanos = nanos / 100LL;
    *out = hundredNsFromSeconds + hundredNsFromNanos;
    return true;
  }

  bool parseTimeProperty(napi_env env, napi_value object, const char *propName, int64_t *target, carrier *c)
  {
    napi_value property;
    c->status = napi_get_named_property(env, object, propName, &property);
    if (c->status != napi_ok)
      return false;

    napi_valuetype type;
    c->status = napi_typeof(env, property, &type);
    if (c->status != napi_ok)
      return false;

    if (type == napi_undefined)
      return true;

    if (type == napi_object)
    {
      bool isArray;
      c->status = napi_is_array(env, property, &isArray);
      if (c->status != napi_ok)
        return false;
      if (isArray)
        return parsePtpTimestampArray(env, property, target, c, propName);
    }

    return getInt64FromValue(env, property, target, c, propName);
  }
}

void sendExecute(napi_env env, void *data)
{
  sendCarrier *c = (sendCarrier *)data;

  NDIlib_send_create_t NDI_send_create_desc;

  NDI_send_create_desc.p_ndi_name = c->name;
  NDI_send_create_desc.p_groups = c->groups;
  NDI_send_create_desc.clock_video = c->clockVideo;
  NDI_send_create_desc.clock_audio = c->clockAudio;
  c->send = NDIlib_send_create(&NDI_send_create_desc);
  if (!c->send)
  {
    c->status = GRANDI_SEND_CREATE_FAIL;
    c->errorMsg = "Failed to create NDI sender.";
    return;
  }
}

/*  implicit destruction of NDI sender via garbage collection  */
void finalizeSend(napi_env env, void *data, void *hint)
{
  /*  fetch NDI sender wrapper object  */
  napi_value obj = (napi_value)hint;

  /*  fetch NDI sender external object  */
  napi_value sendValue;
  if (napi_get_named_property(env, obj, "embedded", &sendValue) != napi_ok)
    return;

  /*  ensure it was still not manually destroyed  */
  napi_valuetype result;
  if (napi_typeof(env, sendValue, &result) != napi_ok)
    return;
  if (result != napi_external)
    return;

  /*  fetch NDI sender native object  */
  void *sendData;
  if (napi_get_value_external(env, sendValue, &sendData) != napi_ok)
    return;
  NDIlib_send_instance_t send = (NDIlib_send_instance_t)sendData;

  /*  call the NDI API  */
  NDIlib_send_destroy(send);
}

/*  explicit destruction of NDI sender via "destroy" method  */
napi_value destroySend(napi_env env, napi_callback_info info)
{
  bool success = false;
  napi_value thisValue;
  size_t argc = 0;
  if (napi_get_cb_info(env, info, &argc, nullptr, &thisValue, nullptr) != napi_ok)
    goto create_result;

  napi_value sendValue;
  if (napi_get_named_property(env, thisValue, "embedded", &sendValue) != napi_ok)
    goto create_result;

  napi_valuetype resultType;
  if (napi_typeof(env, sendValue, &resultType) != napi_ok)
    goto create_result;

  if (resultType == napi_external)
  {
    void *sendData;
    if (napi_get_value_external(env, sendValue, &sendData) != napi_ok)
      goto create_result;

    NDIlib_send_destroy((NDIlib_send_instance_t)sendData);
    napi_value value;
    if (napi_create_int32(env, 0, &value) == napi_ok)
      napi_set_named_property(env, thisValue, "embedded", value);
    success = true;
  }

create_result:
  napi_value result;
  if (napi_get_boolean(env, success, &result) != napi_ok)
  {
    napi_get_boolean(env, false, &result);
  }
  return result;
}

void sendComplete(napi_env env, napi_status asyncStatus, void *data)
{
  sendCarrier *c = (sendCarrier *)data;

  if (asyncStatus != napi_ok)
  {
    c->status = asyncStatus;
    c->errorMsg = "Async sender creation failed to complete.";
  }
  REJECT_STATUS;

  napi_value result;
  c->status = napi_create_object(env, &result);
  REJECT_STATUS;

  napi_value embedded;
  c->status = napi_create_external(env, c->send, finalizeSend, result, &embedded);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "embedded", embedded);
  REJECT_STATUS;

  napi_value destroyFn;
  c->status = napi_create_function(env, "destroy", NAPI_AUTO_LENGTH, destroySend,
                                   nullptr, &destroyFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "destroy", destroyFn);
  REJECT_STATUS;

  napi_value videoFn;
  c->status = napi_create_function(env, "video", NAPI_AUTO_LENGTH, videoSend,
                                   nullptr, &videoFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "video", videoFn);
  REJECT_STATUS;

  napi_value audioFn;
  c->status = napi_create_function(env, "audio", NAPI_AUTO_LENGTH, audioSend,
                                   nullptr, &audioFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "audio", audioFn);
  REJECT_STATUS;

  napi_value metadataFn;
  c->status = napi_create_function(env, "metadata", NAPI_AUTO_LENGTH, metadataSend,
                                   nullptr, &metadataFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "metadata", metadataFn);
  REJECT_STATUS;

  napi_value connectionsFn;
  c->status = napi_create_function(env, "connections", NAPI_AUTO_LENGTH, connections,
                                   nullptr, &connectionsFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "connections", connectionsFn);
  REJECT_STATUS;

  napi_value tallyFn;
  c->status = napi_create_function(env, "connections", NAPI_AUTO_LENGTH, tally,
                                   nullptr, &tallyFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "tally", tallyFn);
  REJECT_STATUS;

  napi_value sourcenameFn;
  c->status = napi_create_function(env, "sourcename", NAPI_AUTO_LENGTH, sourcename,
                                   nullptr, &sourcenameFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "sourcename", sourcenameFn);
  REJECT_STATUS;

  napi_value name, groups, clockVideo, clockAudio;
  c->status = napi_create_string_utf8(env, c->name, NAPI_AUTO_LENGTH, &name);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "name", name);
  REJECT_STATUS;

  if (c->groups != nullptr)
  {
    c->status = napi_create_string_utf8(env, c->groups, NAPI_AUTO_LENGTH, &groups);
    REJECT_STATUS;
    c->status = napi_set_named_property(env, result, "groups", groups);
    REJECT_STATUS;
  }

  c->status = napi_get_boolean(env, c->clockVideo, &clockVideo);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "clockVideo", clockVideo);
  REJECT_STATUS;

  c->status = napi_get_boolean(env, c->clockAudio, &clockAudio);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "clockAudio", clockAudio);
  REJECT_STATUS;

  napi_status status;
  status = napi_resolve_deferred(env, c->_deferred, result);
  FLOATING_STATUS;

  tidyCarrier(env, c);
}

napi_value send(napi_env env, napi_callback_info info)
{
  napi_valuetype type;
  sendCarrier *c = new sendCarrier;

  napi_value promise;
  c->status = napi_create_promise(env, &c->_deferred, &promise);
  REJECT_RETURN;

  size_t argc = 1;
  napi_value args[1];
  c->status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  REJECT_RETURN;

  if (argc != (size_t)1)
    REJECT_ERROR_RETURN(
        "Sender must be created with an object containing at least a 'name' property.",
        GRANDI_INVALID_ARGS);

  c->status = napi_typeof(env, args[0], &type);
  REJECT_RETURN;
  bool isArray;
  c->status = napi_is_array(env, args[0], &isArray);
  REJECT_RETURN;
  if ((type != napi_object) || isArray)
    REJECT_ERROR_RETURN(
        "Single argument must be an object, not an array, containing at least a 'name' property.",
        GRANDI_INVALID_ARGS);

  napi_value config = args[0];
  napi_value name, groups, clockVideo, clockAudio;

  c->status = napi_get_named_property(env, config, "name", &name);
  REJECT_RETURN;
  c->status = napi_typeof(env, name, &type);
  REJECT_RETURN;
  if (type != napi_string)
    REJECT_ERROR_RETURN(
        "Name property must be of type string.",
        GRANDI_INVALID_ARGS);
  size_t namel;
  c->status = napi_get_value_string_utf8(env, name, nullptr, 0, &namel);
  REJECT_RETURN;
  c->name = (char *)malloc(namel + 1);
  c->status = napi_get_value_string_utf8(env, name, c->name, namel + 1, &namel);
  REJECT_RETURN;

  c->status = napi_get_named_property(env, config, "groups", &groups);
  REJECT_RETURN;
  c->status = napi_typeof(env, groups, &type);
  REJECT_RETURN;
  if (type != napi_undefined)
  {
    if (type != napi_string)
      REJECT_ERROR_RETURN(
          "Groups value must be a string when provided.",
          GRANDI_INVALID_ARGS);
    size_t groupsLen;
    c->status = napi_get_value_string_utf8(env, groups, nullptr, 0, &groupsLen);
    REJECT_RETURN;
    c->groups = (char *)malloc(groupsLen + 1);
    c->status = napi_get_value_string_utf8(env, groups, c->groups, groupsLen + 1, &groupsLen);
    REJECT_RETURN;
  }

  c->status = napi_get_named_property(env, config, "clockVideo", &clockVideo);
  REJECT_RETURN;
  c->status = napi_typeof(env, clockVideo, &type);
  REJECT_RETURN;
  if (type != napi_undefined)
  {
    if (type != napi_boolean)
      REJECT_ERROR_RETURN(
          "ClockVideo property must be of type boolean.",
          GRANDI_INVALID_ARGS);
    c->status = napi_get_value_bool(env, clockVideo, &c->clockVideo);
    REJECT_RETURN;
  }

  c->status = napi_get_named_property(env, config, "clockAudio", &clockAudio);
  REJECT_RETURN;
  c->status = napi_typeof(env, clockAudio, &type);
  REJECT_RETURN;
  if (type != napi_undefined)
  {
    if (type != napi_boolean)
      REJECT_ERROR_RETURN(
          "ClockAudio property must be of type boolean.",
          GRANDI_INVALID_ARGS);
    c->status = napi_get_value_bool(env, clockAudio, &c->clockAudio);
    REJECT_RETURN;
  }

  napi_value resource_name;
  c->status = napi_create_string_utf8(env, "Send", NAPI_AUTO_LENGTH, &resource_name);
  REJECT_RETURN;
  c->status = napi_create_async_work(env, NULL, resource_name, sendExecute,
                                     sendComplete, c, &c->_request);
  REJECT_RETURN;
  c->status = napi_queue_async_work(env, c->_request);
  REJECT_RETURN;

  return promise;
}

void videoSendExecute(napi_env env, void *data)
{
  sendDataCarrier *c = (sendDataCarrier *)data;

  NDIlib_send_send_video_v2(c->send, &c->videoFrame);
}

void videoSendComplete(napi_env env, napi_status asyncStatus, void *data)
{
  sendDataCarrier *c = (sendDataCarrier *)data;
  napi_value result;
  napi_status status;

  if (c->passthru != nullptr)
  {
    c->status = napi_delete_reference(env, c->passthru);
    c->passthru = nullptr;
    REJECT_STATUS;
  }

  if (asyncStatus != napi_ok)
  {
    c->status = asyncStatus;
    c->errorMsg = "Async video frame send failed to complete.";
  }
  REJECT_STATUS;

  c->status = napi_create_object(env, &result);
  REJECT_STATUS;
  status = napi_resolve_deferred(env, c->_deferred, result);
  FLOATING_STATUS;

  tidyCarrier(env, c);
}

napi_value videoSend(napi_env env, napi_callback_info info)
{
  napi_valuetype type;
  sendDataCarrier *c = new sendDataCarrier;

  napi_value promise;
  c->status = napi_create_promise(env, &c->_deferred, &promise);
  REJECT_RETURN;

  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  c->status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  REJECT_RETURN;

  napi_value sendValue;
  c->status = napi_get_named_property(env, thisValue, "embedded", &sendValue);
  REJECT_RETURN;
  void *sendData;
  c->status = napi_get_value_external(env, sendValue, &sendData);
  c->send = (NDIlib_send_instance_t)sendData;
  REJECT_RETURN;

  if (argc >= 1)
  {
    napi_value config;
    config = args[0];
    c->status = napi_typeof(env, config, &type);
    REJECT_RETURN;
    if (type != napi_object)
      REJECT_ERROR_RETURN(
          "frame must be an object",
          GRANDI_INVALID_ARGS);

    bool isArray, isBuffer;
    c->status = napi_is_array(env, config, &isArray);
    REJECT_RETURN;
    if (isArray)
      REJECT_ERROR_RETURN(
          "Argument to video send cannot be an array.",
          GRANDI_INVALID_ARGS);

    napi_value param;
    c->status = napi_get_named_property(env, config, "xres", &param);
    REJECT_RETURN;
    c->status = napi_typeof(env, param, &type);
    REJECT_RETURN;
    if (type != napi_number)
      REJECT_ERROR_RETURN(
          "yres value must be a number",
          GRANDI_INVALID_ARGS);
    c->status = napi_get_value_int32(env, param, &c->videoFrame.xres);
    REJECT_RETURN;

    c->status = napi_get_named_property(env, config, "yres", &param);
    REJECT_RETURN;
    c->status = napi_typeof(env, param, &type);
    REJECT_RETURN;
    if (type != napi_number)
      REJECT_ERROR_RETURN(
          "yres value must be a number",
          GRANDI_INVALID_ARGS);
    c->status = napi_get_value_int32(env, param, &c->videoFrame.yres);
    REJECT_RETURN;

    c->status = napi_get_named_property(env, config, "frameRateN", &param);
    REJECT_RETURN;
    c->status = napi_typeof(env, param, &type);
    REJECT_RETURN;
    if (type != napi_number)
      REJECT_ERROR_RETURN(
          "frameRateN value must be a number",
          GRANDI_INVALID_ARGS);
    c->status = napi_get_value_int32(env, param, &c->videoFrame.frame_rate_N);
    REJECT_RETURN;

    c->status = napi_get_named_property(env, config, "frameRateD", &param);
    REJECT_RETURN;
    c->status = napi_typeof(env, param, &type);
    REJECT_RETURN;
    if (type != napi_number)
      REJECT_ERROR_RETURN(
          "frameRateD value must be a number",
          GRANDI_INVALID_ARGS);
    c->status = napi_get_value_int32(env, param, &c->videoFrame.frame_rate_D);
    REJECT_RETURN;

    c->status = napi_get_named_property(env, config, "pictureAspectRatio", &param);
    REJECT_RETURN;
    c->status = napi_typeof(env, param, &type);
    REJECT_RETURN;
    if (type != napi_number)
      REJECT_ERROR_RETURN(
          "pictureAspectRatio value must be a number",
          GRANDI_INVALID_ARGS);
    double pictureAspectRatio;
    c->status = napi_get_value_double(env, param, &pictureAspectRatio);
    REJECT_RETURN;
    c->videoFrame.picture_aspect_ratio = (float)pictureAspectRatio;

    c->videoFrame.timecode = NDIlib_send_timecode_synthesize;
    if (!parseTimeProperty(env, config, "timecode", &c->videoFrame.timecode, c))
      REJECT_RETURN;

    c->videoFrame.timestamp = 0;
    if (!parseTimeProperty(env, config, "timestamp", &c->videoFrame.timestamp, c))
      REJECT_RETURN;

    c->frameMetadata.clear();
    c->videoFrame.p_metadata = nullptr;
    c->status = napi_get_named_property(env, config, "metadata", &param);
    REJECT_RETURN;
    c->status = napi_typeof(env, param, &type);
    REJECT_RETURN;
    if (type != napi_undefined)
    {
      if (type != napi_string)
        REJECT_ERROR_RETURN("metadata value must be a string", GRANDI_INVALID_ARGS);
      size_t metadataLen;
      c->status = napi_get_value_string_utf8(env, param, nullptr, 0, &metadataLen);
      REJECT_RETURN;
      c->frameMetadata.resize(metadataLen + 1);
      c->status = napi_get_value_string_utf8(env, param, c->frameMetadata.data(), metadataLen + 1, &metadataLen);
      REJECT_RETURN;
      c->frameMetadata.resize(metadataLen);
      c->videoFrame.p_metadata = c->frameMetadata.empty() ? nullptr : c->frameMetadata.c_str();
    }

    c->status = napi_get_named_property(env, config, "frameFormatType", &param);
    REJECT_RETURN;
    c->status = napi_typeof(env, param, &type);
    REJECT_RETURN;
    if (type != napi_number)
      REJECT_ERROR_RETURN(
          "frameFormatType value must be a number",
          GRANDI_INVALID_ARGS);
    int32_t formatType;
    c->status = napi_get_value_int32(env, param, &formatType);
    REJECT_RETURN;
    // TODO: checks
    c->videoFrame.frame_format_type = (NDIlib_frame_format_type_e)formatType;

    c->status = napi_get_named_property(env, config, "lineStrideBytes", &param);
    REJECT_RETURN;
    c->status = napi_typeof(env, param, &type);
    REJECT_RETURN;
    if (type != napi_number)
      REJECT_ERROR_RETURN(
          "lineStrideBytes value must be a number",
          GRANDI_INVALID_ARGS);
    c->status = napi_get_value_int32(env, param, &c->videoFrame.line_stride_in_bytes);
    REJECT_RETURN;

    napi_value videoBuffer;
    c->status = napi_get_named_property(env, config, "data", &videoBuffer);
    REJECT_RETURN;
    c->status = napi_is_buffer(env, videoBuffer, &isBuffer);
    REJECT_RETURN;
    if (!isBuffer)
      REJECT_ERROR_RETURN(
          "data must be provided as a Node Buffer",
          GRANDI_INVALID_ARGS);
    void *data;
    size_t length;
    c->status = napi_get_buffer_info(env, videoBuffer, &data, &length);
    REJECT_RETURN;
    c->videoFrame.p_data = (uint8_t *)data;
    napi_ref bufferRef;
    c->status = napi_create_reference(env, videoBuffer, 1, &bufferRef);
    REJECT_RETURN;
    c->passthru = bufferRef;
    // TODO: check length

    c->status = napi_get_named_property(env, config, "fourCC", &param);
    REJECT_RETURN;
    c->status = napi_typeof(env, param, &type);
    REJECT_RETURN;
    if (type != napi_number)
      REJECT_ERROR_RETURN(
          "fourCC value must be a number",
          GRANDI_INVALID_ARGS);
    int32_t fourCC;
    c->status = napi_get_value_int32(env, param, &fourCC);
    REJECT_RETURN;
    // TODO: checks
    c->videoFrame.FourCC = (NDIlib_FourCC_video_type_e)fourCC; // TODO
  }
  else
    REJECT_ERROR_RETURN(
        "frame not provided",
        GRANDI_INVALID_ARGS);

  napi_value resource_name;
  c->status = napi_create_string_utf8(env, "VideoSend", NAPI_AUTO_LENGTH, &resource_name);
  REJECT_RETURN;
  c->status = napi_create_async_work(env, NULL, resource_name, videoSendExecute,
                                     videoSendComplete, c, &c->_request);
  REJECT_RETURN;
  c->status = napi_queue_async_work(env, c->_request);
  REJECT_RETURN;

  return promise;
}

void audioSendExecute(napi_env env, void *data)
{
  sendDataCarrier *c = (sendDataCarrier *)data;

  NDIlib_send_send_audio_v3(c->send, &c->audioFrame);
}

void audioSendComplete(napi_env env, napi_status asyncStatus, void *data)
{
  sendDataCarrier *c = (sendDataCarrier *)data;
  napi_value result;
  napi_status status;

  if (c->passthru != nullptr)
  {
    c->status = napi_delete_reference(env, c->passthru);
    c->passthru = nullptr;
    REJECT_STATUS;
  }

  if (asyncStatus != napi_ok)
  {
    c->status = asyncStatus;
    c->errorMsg = "Async audio frame send failed to complete.";
  }
  REJECT_STATUS;

  c->status = napi_create_object(env, &result);
  REJECT_STATUS;
  status = napi_resolve_deferred(env, c->_deferred, result);
  FLOATING_STATUS;

  tidyCarrier(env, c);
}

napi_value audioSend(napi_env env, napi_callback_info info)
{
  napi_valuetype type;
  sendDataCarrier *c = new sendDataCarrier;

  napi_value promise;
  c->status = napi_create_promise(env, &c->_deferred, &promise);
  REJECT_RETURN;

  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  c->status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  REJECT_RETURN;

  napi_value sendValue;
  c->status = napi_get_named_property(env, thisValue, "embedded", &sendValue);
  REJECT_RETURN;
  void *sendData;
  c->status = napi_get_value_external(env, sendValue, &sendData);
  c->send = (NDIlib_send_instance_t)sendData;
  REJECT_RETURN;

  if (argc >= 1)
  {
    napi_value config;
    config = args[0];
    c->status = napi_typeof(env, config, &type);
    REJECT_RETURN;
    if (type != napi_object)
      REJECT_ERROR_RETURN(
          "frame must be an object",
          GRANDI_INVALID_ARGS);

    bool isArray, isBuffer;
    c->status = napi_is_array(env, config, &isArray);
    REJECT_RETURN;
    if (isArray)
      REJECT_ERROR_RETURN(
          "Argument to audio send cannot be an array.",
          GRANDI_INVALID_ARGS);

    napi_value param;
    c->status = napi_get_named_property(env, config, "sampleRate", &param);
    REJECT_RETURN;
    c->status = napi_typeof(env, param, &type);
    REJECT_RETURN;
    if (type != napi_number)
      REJECT_ERROR_RETURN(
          "sampleRate value must be a number",
          GRANDI_INVALID_ARGS);
    c->status = napi_get_value_int32(env, param, &c->audioFrame.sample_rate);
    REJECT_RETURN;

    c->status = napi_get_named_property(env, config, "noChannels", &param);
    REJECT_RETURN;
    c->status = napi_typeof(env, param, &type);
    REJECT_RETURN;
    if (type != napi_number)
      REJECT_ERROR_RETURN(
          "noChannels value must be a number",
          GRANDI_INVALID_ARGS);
    c->status = napi_get_value_int32(env, param, &c->audioFrame.no_channels);
    REJECT_RETURN;

    c->status = napi_get_named_property(env, config, "noSamples", &param);
    REJECT_RETURN;
    c->status = napi_typeof(env, param, &type);
    REJECT_RETURN;
    if (type != napi_number)
      REJECT_ERROR_RETURN(
          "Samples value must be a number",
          GRANDI_INVALID_ARGS);
    c->status = napi_get_value_int32(env, param, &c->audioFrame.no_samples);
    REJECT_RETURN;

    c->audioFrame.timecode = NDIlib_send_timecode_synthesize;
    if (!parseTimeProperty(env, config, "timecode", &c->audioFrame.timecode, c))
      REJECT_RETURN;

    c->audioFrame.timestamp = 0;
    if (!parseTimeProperty(env, config, "timestamp", &c->audioFrame.timestamp, c))
      REJECT_RETURN;

    c->frameMetadata.clear();
    c->audioFrame.p_metadata = nullptr;
    c->status = napi_get_named_property(env, config, "metadata", &param);
    REJECT_RETURN;
    c->status = napi_typeof(env, param, &type);
    REJECT_RETURN;
    if (type != napi_undefined)
    {
      if (type != napi_string)
        REJECT_ERROR_RETURN("metadata value must be a string", GRANDI_INVALID_ARGS);
      size_t metadataLen;
      c->status = napi_get_value_string_utf8(env, param, nullptr, 0, &metadataLen);
      REJECT_RETURN;
      c->frameMetadata.resize(metadataLen + 1);
      c->status = napi_get_value_string_utf8(env, param, c->frameMetadata.data(), metadataLen + 1, &metadataLen);
      REJECT_RETURN;
      c->frameMetadata.resize(metadataLen);
      c->audioFrame.p_metadata = c->frameMetadata.empty() ? nullptr : c->frameMetadata.c_str();
    }

    c->status = napi_get_named_property(env, config, "channelStrideBytes", &param);
    REJECT_RETURN;
    c->status = napi_typeof(env, param, &type);
    REJECT_RETURN;
    if (type != napi_number)
      REJECT_ERROR_RETURN(
          "channelStrideBytes value must be a number",
          GRANDI_INVALID_ARGS);
    c->status = napi_get_value_int32(env, param, &c->audioFrame.channel_stride_in_bytes);
    REJECT_RETURN;

    napi_value audioBuffer;
    c->status = napi_get_named_property(env, config, "data", &audioBuffer);
    REJECT_RETURN;
    c->status = napi_is_buffer(env, audioBuffer, &isBuffer);
    REJECT_RETURN;
    if (!isBuffer)
      REJECT_ERROR_RETURN(
          "data must be provided as a Node Buffer",
          GRANDI_INVALID_ARGS);
    void *data;
    size_t length;
    c->status = napi_get_buffer_info(env, audioBuffer, &data, &length);
    REJECT_RETURN;
    c->audioFrame.p_data = (uint8_t *)data;
    napi_ref bufferRef;
    c->status = napi_create_reference(env, audioBuffer, 1, &bufferRef);
    REJECT_RETURN;
    c->passthru = bufferRef;

    c->status = napi_get_named_property(env, config, "fourCC", &param);
    REJECT_RETURN;
    c->status = napi_typeof(env, param, &type);
    REJECT_RETURN;
    if (type != napi_number)
      REJECT_ERROR_RETURN(
          "fourCC value must be a number",
          GRANDI_INVALID_ARGS);
    int32_t fourCC;
    c->status = napi_get_value_int32(env, param, &fourCC);
    REJECT_RETURN;
    c->audioFrame.FourCC = (NDIlib_FourCC_audio_type_e)fourCC;
  }
  else
    REJECT_ERROR_RETURN(
        "frame not provided",
        GRANDI_INVALID_ARGS);

  napi_value resource_name;
  c->status = napi_create_string_utf8(env, "AudioSend", NAPI_AUTO_LENGTH, &resource_name);
  REJECT_RETURN;
  c->status = napi_create_async_work(env, NULL, resource_name, audioSendExecute,
                                     audioSendComplete, c, &c->_request);
  REJECT_RETURN;
  c->status = napi_queue_async_work(env, c->_request);
  REJECT_RETURN;

  return promise;
}

napi_value connections(napi_env env, napi_callback_info info)
{
  napi_status status;

  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  CHECK_STATUS;

  napi_value sendValue;
  status = napi_get_named_property(env, thisValue, "embedded", &sendValue);
  CHECK_STATUS;
  void *sendData;
  status = napi_get_value_external(env, sendValue, &sendData);
  CHECK_STATUS;
  NDIlib_send_instance_t sender = (NDIlib_send_instance_t)sendData;

  int conns = NDIlib_send_get_no_connections(sender, 0);
  napi_value result;
  status = napi_create_int32(env, (int32_t)conns, &result);
  CHECK_STATUS;

  return result;
}

napi_value tally(napi_env env, napi_callback_info info)
{
  napi_status status;

  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  CHECK_STATUS;

  napi_value sendValue;
  status = napi_get_named_property(env, thisValue, "embedded", &sendValue);
  CHECK_STATUS;
  void *sendData;
  status = napi_get_value_external(env, sendValue, &sendData);
  CHECK_STATUS;
  NDIlib_send_instance_t sender = (NDIlib_send_instance_t)sendData;

  NDIlib_tally_t tally;
  bool changed = NDIlib_send_get_tally(sender, &tally, 0);

  napi_value result;
  status = napi_create_object(env, &result);
  CHECK_STATUS;

  napi_value value;
  napi_get_boolean(env, changed, &value);
  status = napi_set_named_property(env, result, "changed", value);
  CHECK_STATUS;
  napi_get_boolean(env, tally.on_program, &value);
  status = napi_set_named_property(env, result, "on_program", value);
  CHECK_STATUS;
  napi_get_boolean(env, tally.on_preview, &value);
  status = napi_set_named_property(env, result, "on_preview", value);
  CHECK_STATUS;

  return result;
}

napi_value metadataSend(napi_env env, napi_callback_info info)
{
  napi_status status;

  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  CHECK_STATUS;

  if (argc != 1)
    NAPI_THROW_ERROR("metadata requires a single string argument.");

  napi_value sendValue;
  status = napi_get_named_property(env, thisValue, "embedded", &sendValue);
  CHECK_STATUS;
  void *sendData;
  status = napi_get_value_external(env, sendValue, &sendData);
  CHECK_STATUS;
  NDIlib_send_instance_t sender = (NDIlib_send_instance_t)sendData;

  napi_valuetype type;
  status = napi_typeof(env, args[0], &type);
  CHECK_STATUS;
  if (type != napi_string)
    NAPI_THROW_ERROR("metadata argument must be a string.");

  size_t length;
  status = napi_get_value_string_utf8(env, args[0], nullptr, 0, &length);
  CHECK_STATUS;
  std::string metadata(length + 1, '\0');
  status = napi_get_value_string_utf8(env, args[0], metadata.data(), length + 1, &length);
  CHECK_STATUS;
  metadata.resize(length);

  NDIlib_metadata_frame_t frame;
  frame.length = static_cast<int>(metadata.length());
  frame.timecode = NDIlib_send_timecode_synthesize;
  frame.p_data = const_cast<char *>(metadata.c_str());

  NDIlib_send_send_metadata(sender, &frame);

  napi_value result;
  status = napi_get_boolean(env, true, &result);
  CHECK_STATUS;
  return result;
}

napi_value sourcename(napi_env env, napi_callback_info info)
{
  napi_status status;

  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  CHECK_STATUS;

  napi_value sendValue;
  status = napi_get_named_property(env, thisValue, "embedded", &sendValue);
  CHECK_STATUS;
  void *sendData;
  status = napi_get_value_external(env, sendValue, &sendData);
  CHECK_STATUS;
  NDIlib_send_instance_t sender = (NDIlib_send_instance_t)sendData;

  const NDIlib_source_t *source = NDIlib_send_get_source_name(sender);
  napi_value result;
  status = napi_create_string_utf8(env, source->p_ndi_name, NAPI_AUTO_LENGTH, &result);
  CHECK_STATUS;

  return result;
}
