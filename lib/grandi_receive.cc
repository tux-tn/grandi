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

#include <chrono>
#include <cstddef>
#include <cstdlib>
#include <Processing.NDI.Lib.h>
#include <inttypes.h>

#ifdef _WIN32
#ifdef _WIN64
#pragma comment(lib, "Processing.NDI.Lib.x64.lib")
#else // _WIN64
#pragma comment(lib, "Processing.NDI.Lib.x86.lib")
#endif // _WIN64
#endif // _WIN32

#include "grandi_receive.h"
#include "grandi_util.h"
#include "grandi_find.h"

namespace {
uint32_t remainingWaitMs(uint32_t initialWait,
                         const std::chrono::steady_clock::time_point &start) {
  if (initialWait == 0)
    return 0;
  auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                     std::chrono::steady_clock::now() - start)
                     .count();
  if (elapsed >= initialWait)
    return 0;
  return initialWait - static_cast<uint32_t>(elapsed);
}

void freeCapturedFrame(dataCarrier *c, NDIlib_frame_type_e frameType) {
  switch (frameType) {
  case NDIlib_frame_type_video:
    NDIlib_recv_free_video_v2(c->recv, &c->videoFrame);
    break;
  case NDIlib_frame_type_audio:
    NDIlib_recv_free_audio_v3(c->recv, &c->audioFrame);
    break;
  case NDIlib_frame_type_metadata:
    NDIlib_recv_free_metadata(c->recv, &c->metadataFrame);
    break;
  default:
    break;
  }
}

bool captureUntilFrame(dataCarrier *c, NDIlib_frame_type_e desired,
                       uint32_t initialWait, int32_t timeoutStatus,
                       const char *timeoutMsg, const char *connectionMsg) {
  auto start = std::chrono::steady_clock::now();
  uint32_t waitMs = initialWait;

  while (true) {
    NDIlib_frame_type_e frameType = NDIlib_recv_capture_v3(
        c->recv, &c->videoFrame, &c->audioFrame, &c->metadataFrame, waitMs);

    if (frameType == desired)
      return true;

    switch (frameType) {
    case NDIlib_frame_type_none:
      c->status = timeoutStatus;
      c->errorMsg = timeoutMsg;
      return false;
    case NDIlib_frame_type_error:
      c->status = GRANDI_CONNECTION_LOST;
      c->errorMsg = connectionMsg;
      return false;
    case NDIlib_frame_type_video:
    case NDIlib_frame_type_audio:
    case NDIlib_frame_type_metadata:
      freeCapturedFrame(c, frameType);
      break;
    default:
      break;
    }

    waitMs = remainingWaitMs(initialWait, start);
    if (initialWait != 0 && waitMs == 0) {
      c->status = timeoutStatus;
      c->errorMsg = timeoutMsg;
      return false;
    }
  }
}
} // namespace

void finalizeReceive(napi_env env, void *data, void *hint) {
  if (hint == nullptr) {
    NDIlib_recv_destroy((NDIlib_recv_instance_t)data);
    return;
  }

  napi_value obj = (napi_value)hint;
  napi_value recvValue;
  if (napi_get_named_property(env, obj, "embedded", &recvValue) != napi_ok)
    return;

  napi_valuetype result;
  if (napi_typeof(env, recvValue, &result) != napi_ok)
    return;
  if (result != napi_external)
    return;

  void *recvData;
  if (napi_get_value_external(env, recvValue, &recvData) != napi_ok)
    return;
  NDIlib_recv_destroy((NDIlib_recv_instance_t)recvData);
}

napi_value destroyReceive(napi_env env, napi_callback_info info) {
  bool success = false;
  napi_value thisValue;
  size_t argc = 0;
  if (napi_get_cb_info(env, info, &argc, nullptr, &thisValue, nullptr) !=
      napi_ok)
    goto done;

  napi_value recvValue;
  if (napi_get_named_property(env, thisValue, "embedded", &recvValue) !=
      napi_ok)
    goto done;

  napi_valuetype type;
  if (napi_typeof(env, recvValue, &type) != napi_ok)
    goto done;

  if (type == napi_external) {
    void *recvData;
    if (napi_get_value_external(env, recvValue, &recvData) != napi_ok)
      goto done;
    NDIlib_recv_destroy((NDIlib_recv_instance_t)recvData);
    napi_value value;
    if (napi_create_int32(env, 0, &value) == napi_ok)
      napi_set_named_property(env, thisValue, "embedded", value);
    success = true;
  }

done:
  napi_value result;
  if (napi_get_boolean(env, success, &result) != napi_ok)
    napi_get_boolean(env, false, &result);
  return result;
}

void receiveExecute(napi_env env, void *data) {
  receiveCarrier *c = (receiveCarrier *)data;

  NDIlib_recv_create_v3_t receiveConfig{};
  receiveConfig.source_to_connect_to =
      c->source != nullptr ? *c->source : NDIlib_source_t();
  receiveConfig.color_format = c->colorFormat;
  receiveConfig.bandwidth = c->bandwidth;
  receiveConfig.allow_video_fields = c->allowVideoFields;
  receiveConfig.p_ndi_recv_name = c->name;

  c->recv = NDIlib_recv_create_v3(&receiveConfig);
  if (!c->recv) {
    c->status = GRANDI_RECEIVE_CREATE_FAIL;
    c->errorMsg = "Failed to create NDI receiver.";
    return;
  }

  NDIlib_recv_connect(c->recv, c->source);
}

void receiveComplete(napi_env env, napi_status asyncStatus, void *data) {
  receiveCarrier *c = (receiveCarrier *)data;

  if (asyncStatus != napi_ok) {
    c->status = asyncStatus;
    c->errorMsg = "Async receiver creation failed to complete.";
  }
  REJECT_STATUS;

  napi_value result;
  c->status = napi_create_object(env, &result);
  REJECT_STATUS;

  napi_value embedded;
  c->status =
      napi_create_external(env, c->recv, finalizeReceive, result, &embedded);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "embedded", embedded);
  REJECT_STATUS;

  napi_value destroyFn;
  c->status = napi_create_function(env, "destroy", NAPI_AUTO_LENGTH,
                                   destroyReceive, nullptr, &destroyFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "destroy", destroyFn);
  REJECT_STATUS;

  napi_value videoFn;
  c->status = napi_create_function(env, "video", NAPI_AUTO_LENGTH, videoReceive,
                                   nullptr, &videoFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "video", videoFn);
  REJECT_STATUS;

  napi_value audioFn;
  c->status = napi_create_function(env, "audio", NAPI_AUTO_LENGTH, audioReceive,
                                   nullptr, &audioFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "audio", audioFn);
  REJECT_STATUS;

  napi_value metadataFn;
  c->status = napi_create_function(env, "metadata", NAPI_AUTO_LENGTH,
                                   metadataReceive, nullptr, &metadataFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "metadata", metadataFn);
  REJECT_STATUS;

  napi_value dataFn;
  c->status = napi_create_function(env, "data", NAPI_AUTO_LENGTH, dataReceive,
                                   nullptr, &dataFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "data", dataFn);
  REJECT_STATUS;

  napi_value tallyFn;
  c->status = napi_create_function(env, "tally", NAPI_AUTO_LENGTH,
                                   setReceiveTally, nullptr, &tallyFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "tally", tallyFn);
  REJECT_STATUS;

  napi_value source, name;
  c->status = napi_create_string_utf8(env, c->source->p_ndi_name,
                                      NAPI_AUTO_LENGTH, &name);
  REJECT_STATUS;
  napi_value uri;
  if (c->source->p_url_address != NULL) {
    c->status = napi_create_string_utf8(env, c->source->p_url_address,
                                        NAPI_AUTO_LENGTH, &uri);
    REJECT_STATUS;
  }
  c->status = napi_create_object(env, &source);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, source, "name", name);
  REJECT_STATUS;
  if (c->source->p_url_address != NULL) {
    c->status = napi_set_named_property(env, source, "urlAddress", uri);
    REJECT_STATUS;
  }
  c->status = napi_set_named_property(env, result, "source", source);
  REJECT_STATUS;

  napi_value colorFormat;
  c->status = napi_create_int32(env, (int32_t)c->colorFormat, &colorFormat);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "colorFormat", colorFormat);
  REJECT_STATUS;

  napi_value bandwidth;
  c->status = napi_create_int32(env, (int32_t)c->bandwidth, &bandwidth);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "bandwidth", bandwidth);
  REJECT_STATUS;

  napi_value allowVideoFields;
  c->status = napi_get_boolean(env, c->allowVideoFields, &allowVideoFields);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "allowVideoFields",
                                      allowVideoFields);
  REJECT_STATUS;

  if (c->name != nullptr) {
    c->status = napi_create_string_utf8(env, c->name, NAPI_AUTO_LENGTH, &name);
    REJECT_STATUS;
    c->status = napi_set_named_property(env, result, "name", name);
    REJECT_STATUS;
  }

  napi_status status;
  status = napi_resolve_deferred(env, c->_deferred, result);
  FLOATING_STATUS;

  tidyCarrier(env, c);
}

napi_value receive(napi_env env, napi_callback_info info) {
  napi_valuetype type;
  receiveCarrier *c = new receiveCarrier;

  napi_value promise;
  c->status = napi_create_promise(env, &c->_deferred, &promise);
  REJECT_RETURN;

  size_t argc = 1;
  napi_value args[1];
  c->status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  REJECT_RETURN;

  if (argc != (size_t)1)
    REJECT_ERROR_RETURN("Receiver must be created with an object containing at "
                        "least a 'source' property.",
                        GRANDI_INVALID_ARGS);

  c->status = napi_typeof(env, args[0], &type);
  REJECT_RETURN;
  bool isArray;
  c->status = napi_is_array(env, args[0], &isArray);
  REJECT_RETURN;
  if ((type != napi_object) || isArray)
    REJECT_ERROR_RETURN("Single argument must be an object, not an array, "
                        "containing at least a 'source' property.",
                        GRANDI_INVALID_ARGS);

  napi_value config = args[0];
  napi_value source, colorFormat, bandwidth, allowVideoFields, name;
  // source is an object, not an array, with name and urlAddress
  // convert to a native source
  c->status = napi_get_named_property(env, config, "source", &source);
  REJECT_RETURN;
  c->status = napi_typeof(env, source, &type);
  REJECT_RETURN;
  c->status = napi_is_array(env, source, &isArray);
  REJECT_RETURN;
  if ((type != napi_object) || isArray)
    REJECT_ERROR_RETURN("Source property must be an object and not an array.",
                        GRANDI_INVALID_ARGS);

  napi_value checkType;
  c->status = napi_get_named_property(env, source, "name", &checkType);
  REJECT_RETURN;
  c->status = napi_typeof(env, checkType, &type);
  REJECT_RETURN;
  if (type != napi_string)
    REJECT_ERROR_RETURN("Source property must have a 'name' sub-property that "
                        "is of type string.",
                        GRANDI_INVALID_ARGS);

  c->status = napi_get_named_property(env, source, "urlAddress", &checkType);
  REJECT_RETURN;
  c->status = napi_typeof(env, checkType, &type);
  REJECT_RETURN;
  if (type != napi_undefined && type != napi_string)
    REJECT_ERROR_RETURN(
        "Source 'urlAddress' sub-property must be of type string.",
        GRANDI_INVALID_ARGS);

  c->source = new NDIlib_source_t();
  c->status = makeNativeSource(env, source, c->source);
  REJECT_RETURN;

  c->status = napi_get_named_property(env, config, "colorFormat", &colorFormat);
  REJECT_RETURN;
  c->status = napi_typeof(env, colorFormat, &type);
  REJECT_RETURN;
  if (type != napi_undefined) {
    if (type != napi_number)
      REJECT_ERROR_RETURN("Color format property must be a number.",
                          GRANDI_INVALID_ARGS);
    int32_t enumValue;
    c->status = napi_get_value_int32(env, colorFormat, &enumValue);
    REJECT_RETURN;

    c->colorFormat = (NDIlib_recv_color_format_e)enumValue;
    if (!validColorFormat(c->colorFormat)) {
#ifndef _WIN32
      if (enumValue == 1000)
        REJECT_ERROR_RETURN("BGRX_BGRA_FLIPPED is only supported on Windows.",
                            GRANDI_INVALID_ARGS);
#endif
      REJECT_ERROR_RETURN("Invalid colour format value.", GRANDI_INVALID_ARGS);
    }
  }

  c->status = napi_get_named_property(env, config, "bandwidth", &bandwidth);
  REJECT_RETURN;
  c->status = napi_typeof(env, bandwidth, &type);
  REJECT_RETURN;
  if (type != napi_undefined) {
    if (type != napi_number)
      REJECT_ERROR_RETURN("Bandwidth property must be a number.",
                          GRANDI_INVALID_ARGS);
    int32_t enumValue;
    c->status = napi_get_value_int32(env, bandwidth, &enumValue);
    REJECT_RETURN;

    c->bandwidth = (NDIlib_recv_bandwidth_e)enumValue;
    if (!validBandwidth(c->bandwidth))
      REJECT_ERROR_RETURN("Invalid bandwidth value.", GRANDI_INVALID_ARGS);
  }

  c->status = napi_get_named_property(env, config, "allowVideoFields",
                                      &allowVideoFields);
  REJECT_RETURN;
  c->status = napi_typeof(env, allowVideoFields, &type);
  REJECT_RETURN;
  if (type != napi_undefined) {
    if (type != napi_boolean)
      REJECT_ERROR_RETURN("Allow video fields property must be a Boolean.",
                          GRANDI_INVALID_ARGS);
    c->status =
        napi_get_value_bool(env, allowVideoFields, &c->allowVideoFields);
    REJECT_RETURN;
  }

  // NDI docs: allow_video_fields is implicitly true when using fastest/best.
  if (c->colorFormat == NDIlib_recv_color_format_fastest ||
      c->colorFormat == NDIlib_recv_color_format_best) {
    c->allowVideoFields = true;
  }

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

  napi_value resource_name;
  c->status =
      napi_create_string_utf8(env, "Receive", NAPI_AUTO_LENGTH, &resource_name);
  REJECT_RETURN;
  c->status = napi_create_async_work(env, NULL, resource_name, receiveExecute,
                                     receiveComplete, c, &c->_request);
  REJECT_RETURN;
  c->status = napi_queue_async_work(env, c->_request);
  REJECT_RETURN;

  return promise;
}

void videoReceiveExecute(napi_env env, void *data) {
  dataCarrier *c = (dataCarrier *)data;

  if (!captureUntilFrame(
          c, NDIlib_frame_type_video, c->wait, GRANDI_NOT_FOUND,
          "No video data received in the requested time interval.",
          "Received error response from NDI video request. Connection lost."))
    return;
}

void videoReceiveComplete(napi_env env, napi_status asyncStatus, void *data) {
  dataCarrier *c = (dataCarrier *)data;

  if (asyncStatus != napi_ok) {
    c->status = asyncStatus;
    c->errorMsg = "Async video frame receive failed to complete.";
  }
  REJECT_STATUS;

  napi_value result;
  c->status = napi_create_object(env, &result);
  REJECT_STATUS;

  int32_t ptps, ptpn;
  ptps = (int32_t)(c->videoFrame.timestamp / 10000000);
  ptpn = (c->videoFrame.timestamp % 10000000) * 100;

  napi_value param;
  c->status = napi_create_string_utf8(env, "video", NAPI_AUTO_LENGTH, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "type", param);
  REJECT_STATUS;

  c->status = napi_create_int32(env, c->videoFrame.xres, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "xres", param);
  REJECT_STATUS;

  c->status = napi_create_int32(env, c->videoFrame.yres, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "yres", param);
  REJECT_STATUS;

  c->status = napi_create_int32(env, c->videoFrame.frame_rate_N, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "frameRateN", param);
  REJECT_STATUS;

  c->status = napi_create_int32(env, c->videoFrame.frame_rate_D, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "frameRateD", param);
  REJECT_STATUS;

  c->status = napi_create_double(
      env, (double)c->videoFrame.picture_aspect_ratio, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "pictureAspectRatio", param);
  REJECT_STATUS;

  napi_value params, paramn;
  c->status = napi_create_int32(env, ptps, &params);
  REJECT_STATUS;
  c->status = napi_create_int32(env, ptpn, &paramn);
  REJECT_STATUS;
  c->status = napi_create_array(env, &param);
  REJECT_STATUS;
  c->status = napi_set_element(env, param, 0, params);
  REJECT_STATUS;
  c->status = napi_set_element(env, param, 1, paramn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "timestamp", param);
  REJECT_STATUS;

  c->status = napi_create_int32(env, c->videoFrame.FourCC, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "fourCC", param);
  REJECT_STATUS;

  c->status = napi_create_int32(env, c->videoFrame.frame_format_type, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "frameFormatType", param);
  REJECT_STATUS;

  c->status = napi_create_int32(env, (int32_t)c->videoFrame.timecode / 10000000,
                                &params);
  REJECT_STATUS;
  c->status = napi_create_int32(env, (c->videoFrame.timecode % 10000000) * 100,
                                &paramn);
  REJECT_STATUS;
  c->status = napi_create_array(env, &param);
  REJECT_STATUS;
  c->status = napi_set_element(env, param, 0, params);
  REJECT_STATUS;
  c->status = napi_set_element(env, param, 1, paramn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "timecode", param);
  REJECT_STATUS;

  c->status =
      napi_create_int32(env, c->videoFrame.line_stride_in_bytes, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "lineStrideBytes", param);
  REJECT_STATUS;

  if (c->videoFrame.p_metadata != nullptr) {
    c->status = napi_create_string_utf8(env, c->videoFrame.p_metadata,
                                        NAPI_AUTO_LENGTH, &param);
    REJECT_STATUS;
    c->status = napi_set_named_property(env, result, "metadata", param);
    REJECT_STATUS;
  }

  size_t videoBytes = videoDataSize(c->videoFrame);
  if (c->videoFrame.p_data == nullptr || videoBytes == 0) {
    c->errorMsg = "Received empty NDI video frame buffer.";
    c->status = GRANDI_NOT_VIDEO;
    REJECT_STATUS;
  }

  c->status = napi_create_buffer_copy(env, videoBytes,
                                      (void *)c->videoFrame.p_data, nullptr,
                                      &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "data", param);
  REJECT_STATUS;

  NDIlib_recv_free_video_v2(c->recv, &c->videoFrame);

  napi_status status;
  status = napi_resolve_deferred(env, c->_deferred, result);
  FLOATING_STATUS;

  tidyCarrier(env, c);
}

napi_value setReceiveTally(napi_env env, napi_callback_info info) {
  napi_status status;

  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  CHECK_STATUS;

  if (argc != 1)
    NAPI_THROW_ERROR(
        "Receiver tally must be called with a single options object.");

  napi_value embedded;
  status = napi_get_named_property(env, thisValue, "embedded", &embedded);
  CHECK_STATUS;
  void *recvData;
  status = napi_get_value_external(env, embedded, &recvData);
  CHECK_STATUS;
  NDIlib_recv_instance_t recv = (NDIlib_recv_instance_t)recvData;

  napi_valuetype type;
  status = napi_typeof(env, args[0], &type);
  CHECK_STATUS;
  bool isArray;
  status = napi_is_array(env, args[0], &isArray);
  CHECK_STATUS;
  if ((type != napi_object) || isArray)
    NAPI_THROW_ERROR("Receiver tally argument must be an object.");

  bool onProgram = false;
  bool onPreview = false;
  // check for onProgram and onPreview properties
  napi_value checkType;
  status = napi_get_named_property(env, args[0], "onProgram", &checkType);
  CHECK_STATUS;
  status = napi_typeof(env, checkType, &type);
  CHECK_STATUS;
  if (type != napi_undefined) {
    if (type != napi_boolean)
      NAPI_THROW_ERROR("onProgram property must be a Boolean.");
    status = napi_get_value_bool(env, checkType, &onProgram);
    CHECK_STATUS;
  }

  status = napi_get_named_property(env, args[0], "onPreview", &checkType);
  CHECK_STATUS;
  status = napi_typeof(env, checkType, &type);
  CHECK_STATUS;
  if (type != napi_undefined) {
    if (type != napi_boolean)
      NAPI_THROW_ERROR("onPreview property must be a Boolean.");
    status = napi_get_value_bool(env, checkType, &onPreview);
    CHECK_STATUS;
  }

  NDIlib_tally_t tally;
  tally.on_program = onProgram;
  tally.on_preview = onPreview;
  NDIlib_recv_set_tally(recv, &tally);

  napi_value result;
  status = napi_get_boolean(env, true, &result);
  CHECK_STATUS;
  return result;
}

napi_value videoReceive(napi_env env, napi_callback_info info) {
  napi_valuetype type;
  dataCarrier *c = new dataCarrier;

  napi_value promise;
  c->status = napi_create_promise(env, &c->_deferred, &promise);
  REJECT_RETURN;

  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  c->status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  REJECT_RETURN;

  napi_value recvValue;
  c->status = napi_get_named_property(env, thisValue, "embedded", &recvValue);
  REJECT_RETURN;
  void *recvData;
  c->status = napi_get_value_external(env, recvValue, &recvData);
  c->recv = (NDIlib_recv_instance_t)recvData;
  REJECT_RETURN;

  if (argc >= 1) {
    c->status = napi_typeof(env, args[0], &type);
    REJECT_RETURN;
    if (type == napi_number) {
      c->status = napi_get_value_uint32(env, args[0], &c->wait);
      REJECT_RETURN;
    }
  }

  napi_value resource_name;
  c->status = napi_create_string_utf8(env, "VideoReceive", NAPI_AUTO_LENGTH,
                                      &resource_name);
  REJECT_RETURN;
  c->status =
      napi_create_async_work(env, NULL, resource_name, videoReceiveExecute,
                             videoReceiveComplete, c, &c->_request);
  REJECT_RETURN;
  c->status = napi_queue_async_work(env, c->_request);
  REJECT_RETURN;

  return promise;
}

void audioReceiveExecute(napi_env env, void *data) {
  dataCarrier *c = (dataCarrier *)data;

  if (!captureUntilFrame(
          c, NDIlib_frame_type_audio, c->wait, GRANDI_NOT_FOUND,
          "No audio data received in the requested time interval.",
          "Received error response from NDI audio request. Connection lost."))
    return;

  const NDIlib_audio_frame_v2_t *audioFrameV2 =
      reinterpret_cast<const NDIlib_audio_frame_v2_t *>(&c->audioFrame);

  switch (c->audioFormat) {
  case Grandi_audio_format_int_16_interleaved:
    c->audioFrame16s.reference_level = c->referenceLevel;
    c->audioFrame16s.p_data =
        new short[c->audioFrame.no_samples * c->audioFrame.no_channels];
    NDIlib_util_audio_to_interleaved_16s_v2(audioFrameV2, &c->audioFrame16s);
    break;
  case Grandi_audio_format_float_32_interleaved:
    c->audioFrame32fIlvd.p_data =
        new float[c->audioFrame.no_samples * c->audioFrame.no_channels];
    NDIlib_util_audio_to_interleaved_32f_v2(audioFrameV2,
                                            &c->audioFrame32fIlvd);
    break;
  case Grandi_audio_format_float_32_separate:
  default:
    break;
  }
}

void audioReceiveComplete(napi_env env, napi_status asyncStatus, void *data) {
  dataCarrier *c = (dataCarrier *)data;

  if (asyncStatus != napi_ok) {
    c->status = asyncStatus;
    c->errorMsg = "Async audio frame receive failed to complete.";
  }
  REJECT_STATUS;

  napi_value result;
  c->status = napi_create_object(env, &result);
  REJECT_STATUS;

  int32_t ptps, ptpn;
  ptps = (int32_t)(c->audioFrame.timestamp / 10000000);
  ptpn = (c->audioFrame.timestamp % 10000000) * 100;

  napi_value param;
  c->status = napi_create_string_utf8(env, "audio", NAPI_AUTO_LENGTH, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "type", param);
  REJECT_STATUS;

  c->status = napi_create_int32(env, c->audioFormat, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "audioFormat", param);
  REJECT_STATUS;

  if (c->audioFormat == Grandi_audio_format_int_16_interleaved) {
    c->status = napi_create_int32(env, c->referenceLevel, &param);
    REJECT_STATUS;
    c->status = napi_set_named_property(env, result, "referenceLevel", param);
    REJECT_STATUS;
  }

  c->status = napi_create_int32(env, c->audioFrame.sample_rate, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "sampleRate", param);
  REJECT_STATUS;

  c->status = napi_create_int32(env, c->audioFrame.no_channels, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "channels", param);
  REJECT_STATUS;

  c->status = napi_create_int32(env, c->audioFrame.no_samples, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "samples", param);
  REJECT_STATUS;

  int32_t factor =
      (c->audioFormat == Grandi_audio_format_int_16_interleaved) ? 2 : 1;
  c->status = napi_create_int32(
      env, c->audioFrame.channel_stride_in_bytes / factor, &param);
  REJECT_STATUS;
  c->status =
      napi_set_named_property(env, result, "channelStrideInBytes", param);
  REJECT_STATUS;

  napi_value params, paramn;
  c->status = napi_create_int32(env, ptps, &params);
  REJECT_STATUS;
  c->status = napi_create_int32(env, ptpn, &paramn);
  REJECT_STATUS;
  c->status = napi_create_array(env, &param);
  REJECT_STATUS;
  c->status = napi_set_element(env, param, 0, params);
  REJECT_STATUS;
  c->status = napi_set_element(env, param, 1, paramn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "timestamp", param);
  REJECT_STATUS;

  c->status = napi_create_int32(
      env, (int32_t)(c->audioFrame.timecode / 10000000), &params);
  REJECT_STATUS;
  c->status = napi_create_int32(env, (c->audioFrame.timecode % 10000000) * 100,
                                &paramn);
  REJECT_STATUS;
  c->status = napi_create_array(env, &param);
  REJECT_STATUS;
  c->status = napi_set_element(env, param, 0, params);
  REJECT_STATUS;
  c->status = napi_set_element(env, param, 1, paramn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "timecode", param);
  REJECT_STATUS;

  if (c->audioFrame.p_metadata != nullptr) {
    c->status = napi_create_string_utf8(env, c->audioFrame.p_metadata,
                                        NAPI_AUTO_LENGTH, &param);
    REJECT_STATUS;
    c->status = napi_set_named_property(env, result, "metadata", param);
    REJECT_STATUS;
  }

  char *rawFloats;
  switch (c->audioFormat) {
  case Grandi_audio_format_int_16_interleaved:
    rawFloats = (char *)c->audioFrame16s.p_data;
    break;
  case Grandi_audio_format_float_32_interleaved:
    rawFloats = (char *)c->audioFrame32fIlvd.p_data;
    break;
  default:
  case Grandi_audio_format_float_32_separate:
    rawFloats = (char *)c->audioFrame.p_data;
    break;
  }
  c->status =
      napi_create_buffer_copy(env,
                              (c->audioFrame.channel_stride_in_bytes / factor) *
                                  c->audioFrame.no_channels,
                              rawFloats, nullptr, &param);
  REJECT_STATUS;

  c->status = napi_set_named_property(env, result, "data", param);
  REJECT_STATUS;

  NDIlib_recv_free_audio_v3(c->recv, &c->audioFrame);

  napi_status status;
  status = napi_resolve_deferred(env, c->_deferred, result);
  FLOATING_STATUS;

  tidyCarrier(env, c);
}

napi_value dataAndAudioReceive(napi_env env, napi_callback_info info,
                               const char *resourceName,
                               napi_async_execute_callback execute,
                               napi_async_complete_callback complete) {
  napi_valuetype type;
  dataCarrier *c = new dataCarrier;

  napi_value promise;
  c->status = napi_create_promise(env, &c->_deferred, &promise);
  REJECT_RETURN;

  size_t argc = 2;
  napi_value args[2];
  napi_value thisValue;
  c->status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  REJECT_RETURN;

  napi_value recvValue;
  c->status = napi_get_named_property(env, thisValue, "embedded", &recvValue);
  REJECT_RETURN;
  void *recvData;
  c->status = napi_get_value_external(env, recvValue, &recvData);
  c->recv = (NDIlib_recv_instance_t)recvData;
  REJECT_RETURN;

  if (argc >= 1) {
    napi_value configValue, waitValue;
    configValue = args[0];
    c->status = napi_typeof(env, configValue, &type);
    REJECT_RETURN;
    waitValue = (type == napi_number) ? args[0] : args[1];
    if (type == napi_object) {
      bool isArray;
      c->status = napi_is_array(env, configValue, &isArray);
      REJECT_RETURN;
      if (isArray)
        REJECT_ERROR_RETURN(
            "First argument to audio receive cannot be an array.",
            GRANDI_INVALID_ARGS);

      napi_value param;
      c->status =
          napi_get_named_property(env, configValue, "audioFormat", &param);
      REJECT_RETURN;
      c->status = napi_typeof(env, param, &type);
      REJECT_RETURN;
      if (type == napi_number) {
        uint32_t audioFormatN;
        c->status = napi_get_value_uint32(env, param, &audioFormatN);
        REJECT_RETURN;
        if (!validAudioFormat((Grandi_audio_format_e)audioFormatN))
          REJECT_ERROR_RETURN("Invalid audio format specified.",
                              GRANDI_INVALID_ARGS);
        c->audioFormat = (Grandi_audio_format_e)audioFormatN;
      } else if (type != napi_undefined)
        REJECT_ERROR_RETURN("Audio format value must be a number if present.",
                            GRANDI_INVALID_ARGS);

      c->status =
          napi_get_named_property(env, configValue, "referenceLevel", &param);
      REJECT_RETURN;
      c->status = napi_typeof(env, param, &type);
      REJECT_RETURN;
      if (type == napi_number) {
        c->status = napi_get_value_int32(env, param, &c->referenceLevel);
        REJECT_RETURN;
      } else if (type != napi_undefined)
        REJECT_ERROR_RETURN(
            "Audio reference level must be a number if present.",
            GRANDI_INVALID_ARGS);
    }
    c->status = napi_typeof(env, waitValue, &type);
    REJECT_RETURN;
    if (type == napi_number) {
      c->status = napi_get_value_uint32(env, waitValue, &c->wait);
      REJECT_RETURN;
    }
  }

  napi_value resource_name;
  c->status = napi_create_string_utf8(env, resourceName, NAPI_AUTO_LENGTH,
                                      &resource_name);
  REJECT_RETURN;
  c->status = napi_create_async_work(env, NULL, resource_name, execute,
                                     complete, c, &c->_request);
  REJECT_RETURN;
  c->status = napi_queue_async_work(env, c->_request);
  REJECT_RETURN;

  return promise;
}

napi_value audioReceive(napi_env env, napi_callback_info info) {
  return dataAndAudioReceive(env, info, "AudioReceive", audioReceiveExecute,
                             audioReceiveComplete);
}

void metadataReceiveExecute(napi_env env, void *data) {
  dataCarrier *c = (dataCarrier *)data;

  if (!captureUntilFrame(c, NDIlib_frame_type_metadata, c->wait,
                         GRANDI_NOT_FOUND,
                         "No metadata received in the requested time interval.",
                         "Received error response from NDI metadata request. "
                         "Connection lost."))
    return;
}

void metadataReceiveComplete(napi_env env, napi_status asyncStatus,
                             void *data) {
  dataCarrier *c = (dataCarrier *)data;

  if (asyncStatus != napi_ok) {
    c->status = asyncStatus;
    c->errorMsg = "Async metadata payload receive failed to complete.";
  }
  REJECT_STATUS;

  napi_value result;
  c->status = napi_create_object(env, &result);
  REJECT_STATUS;

  napi_value param;
  c->status =
      napi_create_string_utf8(env, "metadata", NAPI_AUTO_LENGTH, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "type", param);
  REJECT_STATUS;

  c->status = napi_create_int32(env, c->metadataFrame.length, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "length", param);
  REJECT_STATUS;

  napi_value params, paramn;
  c->status = napi_create_int32(
      env, (int32_t)(c->metadataFrame.timecode / 10000000), &params);
  REJECT_STATUS;
  c->status = napi_create_int32(
      env, (c->metadataFrame.timecode % 10000000) * 100, &paramn);
  REJECT_STATUS;

  napi_value timestampArray;
  c->status = napi_create_array(env, &timestampArray);
  REJECT_STATUS;
  c->status = napi_set_element(env, timestampArray, 0, params);
  REJECT_STATUS;
  c->status = napi_set_element(env, timestampArray, 1, paramn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "timestamp", timestampArray);
  REJECT_STATUS;

  c->status = napi_create_array(env, &param);
  REJECT_STATUS;
  c->status = napi_set_element(env, param, 0, params);
  REJECT_STATUS;
  c->status = napi_set_element(env, param, 1, paramn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "timecode", param);
  REJECT_STATUS;

  c->status = napi_create_string_utf8(env, c->metadataFrame.p_data,
                                      NAPI_AUTO_LENGTH, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "data", param);
  REJECT_STATUS;

  NDIlib_recv_free_metadata(c->recv, &c->metadataFrame);

  napi_status status;
  status = napi_resolve_deferred(env, c->_deferred, result);
  FLOATING_STATUS;

  tidyCarrier(env, c);
}

napi_value metadataReceive(napi_env env, napi_callback_info info) {
  napi_valuetype type;
  dataCarrier *c = new dataCarrier;

  napi_value promise;
  c->status = napi_create_promise(env, &c->_deferred, &promise);
  REJECT_RETURN;

  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  c->status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  REJECT_RETURN;

  napi_value recvValue;
  c->status = napi_get_named_property(env, thisValue, "embedded", &recvValue);
  REJECT_RETURN;
  void *recvData;
  c->status = napi_get_value_external(env, recvValue, &recvData);
  c->recv = (NDIlib_recv_instance_t)recvData;
  REJECT_RETURN;

  if (argc >= 1) {
    c->status = napi_typeof(env, args[0], &type);
    REJECT_RETURN;
    if (type == napi_number) {
      c->status = napi_get_value_uint32(env, args[0], &c->wait);
      REJECT_RETURN;
    }
  }

  napi_value resource_name;
  c->status = napi_create_string_utf8(env, "MetadataReceive", NAPI_AUTO_LENGTH,
                                      &resource_name);
  REJECT_RETURN;
  c->status =
      napi_create_async_work(env, NULL, resource_name, metadataReceiveExecute,
                             metadataReceiveComplete, c, &c->_request);
  REJECT_RETURN;
  c->status = napi_queue_async_work(env, c->_request);
  REJECT_RETURN;

  return promise;
}

void dataReceiveExecute(napi_env env, void *data) {
  dataCarrier *c = (dataCarrier *)data;

  c->frameType = NDIlib_recv_capture_v3(c->recv, &c->videoFrame, &c->audioFrame,
                                        &c->metadataFrame, c->wait);
  switch (c->frameType) {

  // Audio data
  case NDIlib_frame_type_audio: {
    const NDIlib_audio_frame_v2_t *audioFrameV2 =
        reinterpret_cast<const NDIlib_audio_frame_v2_t *>(&c->audioFrame);
    switch (c->audioFormat) {
    case Grandi_audio_format_int_16_interleaved:
      c->audioFrame16s.reference_level = c->referenceLevel;
      c->audioFrame16s.p_data =
          new short[c->audioFrame.no_samples * c->audioFrame.no_channels];
      NDIlib_util_audio_to_interleaved_16s_v2(audioFrameV2, &c->audioFrame16s);
      break;
    case Grandi_audio_format_float_32_interleaved:
      c->audioFrame32fIlvd.p_data =
          new float[c->audioFrame.no_samples * c->audioFrame.no_channels];
      NDIlib_util_audio_to_interleaved_32f_v2(audioFrameV2,
                                              &c->audioFrame32fIlvd);
      break;
    case Grandi_audio_format_float_32_separate:
    default:
      break;
    }
    break;
  }

  // Handle all other types on completion
  default:
    break;
  }
}

void dataReceiveComplete(napi_env env, napi_status asyncStatus, void *data) {
  dataCarrier *c = (dataCarrier *)data;

  if (asyncStatus != napi_ok) {
    c->status = asyncStatus;
    c->errorMsg = "Async data payload receive failed to complete.";
  }
  REJECT_STATUS;

  napi_status status;
  switch (c->frameType) {
  case NDIlib_frame_type_video:
    videoReceiveComplete(env, asyncStatus, data);
    break;
  case NDIlib_frame_type_audio:
    audioReceiveComplete(env, asyncStatus, data);
    break;
  case NDIlib_frame_type_metadata:
    metadataReceiveComplete(env, asyncStatus, data);
    break;
  case NDIlib_frame_type_error:
    c->errorMsg =
        "Received error response from NDI data request. Connection lost.";
    c->status = GRANDI_CONNECTION_LOST;
    REJECT_STATUS;
    break;
  case NDIlib_frame_type_source_change:
    napi_value result_sc, param_sc;
    c->status = napi_create_object(env, &result_sc);
    REJECT_STATUS;
    c->status = napi_create_string_utf8(env, "sourceChange", NAPI_AUTO_LENGTH,
                                        &param_sc);
    REJECT_STATUS;
    c->status = napi_set_named_property(env, result_sc, "type", param_sc);
    REJECT_STATUS;
    status = napi_resolve_deferred(env, c->_deferred, result_sc);
    FLOATING_STATUS;

    tidyCarrier(env, c);
    break;
  case NDIlib_frame_type_status_change:
    napi_value result, param;
    c->status = napi_create_object(env, &result);
    REJECT_STATUS;
    c->status =
        napi_create_string_utf8(env, "statusChange", NAPI_AUTO_LENGTH, &param);
    REJECT_STATUS;
    c->status = napi_set_named_property(env, result, "type", param);
    REJECT_STATUS;
    status = napi_resolve_deferred(env, c->_deferred, result);
    FLOATING_STATUS;

    tidyCarrier(env, c);
    break;
  case NDIlib_frame_type_none:
    napi_value timeoutResult, timeoutType;
    c->status = napi_create_object(env, &timeoutResult);
    REJECT_STATUS;
    c->status =
        napi_create_string_utf8(env, "timeout", NAPI_AUTO_LENGTH, &timeoutType);
    REJECT_STATUS;
    c->status =
        napi_set_named_property(env, timeoutResult, "type", timeoutType);
    REJECT_STATUS;
    status = napi_resolve_deferred(env, c->_deferred, timeoutResult);
    FLOATING_STATUS;

    tidyCarrier(env, c);
    break;
  case NDIlib_frame_type_max:
    c->errorMsg = "Unknown NDI frame type returned from receive call.";
    c->status = GRANDI_ASYNC_FAILURE;
    REJECT_STATUS;
    break;
  }
}

napi_value dataReceive(napi_env env, napi_callback_info info) {
  return dataAndAudioReceive(env, info, "DataReceive", dataReceiveExecute,
                             dataReceiveComplete);
}
