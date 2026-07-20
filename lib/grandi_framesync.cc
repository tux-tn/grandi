/* Copyright 2025 Sarhan Aissi <github@tux.tn>.

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

#include <cstddef>
#include <mutex>

#include <Processing.NDI.Lib.h>
#include <Processing.NDI.FrameSync.h>

#include "grandi_framesync.h"
#include "grandi_util.h"

namespace {
struct framesyncWrapper {
  napi_env env = nullptr;
  NDIlib_framesync_instance_t fs = nullptr;
  napi_ref receiverRef = nullptr;
  nativeHandle *recvHandle = nullptr;
  bool closing = false;
  bool finalized = false;
  uint32_t active = 0;
  std::mutex mutex;
};

struct framesyncCarrier : carrier {
  nativeHandle *recvHandle = nullptr;
  NDIlib_recv_instance_t recv = nullptr;
  NDIlib_framesync_instance_t fs = nullptr;
  ~framesyncCarrier() {
    if (recvHandle != nullptr)
      releaseNativeHandle(recvHandle);
  }
};

struct framesyncVideoCarrier : carrier {
  framesyncWrapper *wrapper = nullptr;
  NDIlib_video_frame_v2_t videoFrame{};
  NDIlib_frame_format_type_e fieldType = NDIlib_frame_format_type_progressive;
  bool noVideo = false;
  ~framesyncVideoCarrier();
};

struct framesyncAudioCarrier : carrier {
  framesyncWrapper *wrapper = nullptr;
  NDIlib_audio_frame_v3_t audioFrame{};
  int sampleRate = 0;
  int noChannels = 0;
  int noSamples = 0;
  ~framesyncAudioCarrier();
};

void closeFrameSyncWrapper(napi_env env, framesyncWrapper *wrapper) {
  if (wrapper == nullptr)
    return;
  NDIlib_framesync_instance_t fsToDestroy = nullptr;
  napi_ref receiverRefToDelete = nullptr;
  nativeHandle *recvHandleToRelease = nullptr;
  {
    std::lock_guard<std::mutex> lock(wrapper->mutex);
    wrapper->closing = true;
    if (wrapper->active == 0) {
      fsToDestroy = wrapper->fs;
      receiverRefToDelete = wrapper->receiverRef;
      recvHandleToRelease = wrapper->recvHandle;
      wrapper->fs = nullptr;
      wrapper->receiverRef = nullptr;
      wrapper->recvHandle = nullptr;
    }
  }
  if (fsToDestroy != nullptr)
    NDIlib_framesync_destroy(fsToDestroy);
  if (receiverRefToDelete != nullptr)
    napi_delete_reference(env, receiverRefToDelete);
  if (recvHandleToRelease != nullptr)
    releaseNativeHandle(recvHandleToRelease);
}

bool acquireFrameSyncFromThis(napi_env env, napi_value thisValue,
                              framesyncWrapper **wrapper, carrier *c) {
  napi_value fsValue;
  c->status = napi_get_named_property(env, thisValue, "embedded", &fsValue);
  if (c->status != napi_ok)
    return false;
  napi_valuetype type;
  c->status = napi_typeof(env, fsValue, &type);
  if (c->status != napi_ok)
    return false;
  if (type != napi_external) {
    c->status = GRANDI_INVALID_ARGS;
    c->errorMsg = "FrameSync has been destroyed.";
    return false;
  }
  void *externalData;
  c->status = napi_get_value_external(env, fsValue, &externalData);
  if (c->status != napi_ok)
    return false;
  framesyncWrapper *native = (framesyncWrapper *)externalData;
  {
    std::lock_guard<std::mutex> lock(native->mutex);
    if (native->closing || native->fs == nullptr) {
      c->status = GRANDI_INVALID_ARGS;
      c->errorMsg = "FrameSync has been destroyed.";
      return false;
    }
    native->active++;
  }
  *wrapper = native;
  return true;
}

void releaseFrameSyncWrapper(framesyncWrapper *wrapper) {
  if (wrapper == nullptr)
    return;
  NDIlib_framesync_instance_t fsToDestroy = nullptr;
  napi_ref receiverRefToDelete = nullptr;
  nativeHandle *recvHandleToRelease = nullptr;
  bool deleteWrapper = false;
  {
    std::lock_guard<std::mutex> lock(wrapper->mutex);
    if (wrapper->active > 0)
      wrapper->active--;
    if (wrapper->closing && wrapper->active == 0 && wrapper->fs != nullptr) {
      fsToDestroy = wrapper->fs;
      receiverRefToDelete = wrapper->receiverRef;
      recvHandleToRelease = wrapper->recvHandle;
      wrapper->fs = nullptr;
      wrapper->receiverRef = nullptr;
      wrapper->recvHandle = nullptr;
    }
    deleteWrapper = wrapper->finalized && wrapper->active == 0;
  }
  if (fsToDestroy != nullptr)
    NDIlib_framesync_destroy(fsToDestroy);
  if (receiverRefToDelete != nullptr)
    napi_delete_reference(wrapper->env, receiverRefToDelete);
  if (recvHandleToRelease != nullptr)
    releaseNativeHandle(recvHandleToRelease);
  if (deleteWrapper)
    delete wrapper;
}

framesyncVideoCarrier::~framesyncVideoCarrier() {
  if (wrapper != nullptr)
    releaseFrameSyncWrapper(wrapper);
}

framesyncAudioCarrier::~framesyncAudioCarrier() {
  if (wrapper != nullptr)
    releaseFrameSyncWrapper(wrapper);
}

struct FrameSyncVideoGuard {
  framesyncWrapper *wrapper = nullptr;
  NDIlib_video_frame_v2_t frame{};

  explicit FrameSyncVideoGuard(framesyncVideoCarrier *c)
      : wrapper(c->wrapper), frame(c->videoFrame) {
    c->wrapper = nullptr;
  }

  ~FrameSyncVideoGuard() {
    NDIlib_framesync_free_video(wrapper->fs, &frame);
    releaseFrameSyncWrapper(wrapper);
  }
};

struct FrameSyncAudioGuard {
  framesyncWrapper *wrapper = nullptr;
  NDIlib_audio_frame_v3_t frame{};

  explicit FrameSyncAudioGuard(framesyncAudioCarrier *c)
      : wrapper(c->wrapper), frame(c->audioFrame) {
    c->wrapper = nullptr;
  }

  ~FrameSyncAudioGuard() {
    NDIlib_framesync_free_audio_v2(wrapper->fs, &frame);
    releaseFrameSyncWrapper(wrapper);
  }
};

void finalizeFrameSync(napi_env env, void *data, void *hint) {
  framesyncWrapper *wrapper = (framesyncWrapper *)data;
  NDIlib_framesync_instance_t fsToDestroy = nullptr;
  napi_ref receiverRefToDelete = nullptr;
  nativeHandle *recvHandleToRelease = nullptr;
  bool deleteWrapper = false;
  {
    std::lock_guard<std::mutex> lock(wrapper->mutex);
    wrapper->finalized = true;
    wrapper->closing = true;
    if (wrapper->active == 0) {
      fsToDestroy = wrapper->fs;
      receiverRefToDelete = wrapper->receiverRef;
      recvHandleToRelease = wrapper->recvHandle;
      wrapper->fs = nullptr;
      wrapper->receiverRef = nullptr;
      wrapper->recvHandle = nullptr;
      deleteWrapper = true;
    }
  }
  if (fsToDestroy != nullptr)
    NDIlib_framesync_destroy(fsToDestroy);
  if (receiverRefToDelete != nullptr)
    napi_delete_reference(env, receiverRefToDelete);
  if (recvHandleToRelease != nullptr)
    releaseNativeHandle(recvHandleToRelease);
  if (deleteWrapper)
    delete wrapper;
}

napi_value destroyFrameSync(napi_env env, napi_callback_info info) {
  bool success = false;
  napi_value thisValue;
  size_t argc = 0;
  if (napi_get_cb_info(env, info, &argc, nullptr, &thisValue, nullptr) !=
      napi_ok)
    goto done;

  napi_value fsValue;
  if (napi_get_named_property(env, thisValue, "embedded", &fsValue) != napi_ok)
    goto done;

  napi_valuetype type;
  if (napi_typeof(env, fsValue, &type) != napi_ok)
    goto done;

  if (type == napi_external) {
    void *externalData;
    if (napi_get_value_external(env, fsValue, &externalData) != napi_ok)
      goto done;
    framesyncWrapper *wrapper = (framesyncWrapper *)externalData;

    closeFrameSyncWrapper(env, wrapper);

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

napi_value audioQueueDepth(napi_env env, napi_callback_info info) {
  napi_status status;

  size_t argc = 0;
  napi_value thisValue;
  status = napi_get_cb_info(env, info, &argc, nullptr, &thisValue, nullptr);
  CHECK_STATUS;

  carrier c;
  framesyncWrapper *wrapper = nullptr;
  if (!acquireFrameSyncFromThis(env, thisValue, &wrapper, &c)) {
    napi_throw_error(env, nullptr,
                     c.errorMsg.empty() ? "FrameSync has been destroyed."
                                        : c.errorMsg.c_str());
    return nullptr;
  }

  int depth = NDIlib_framesync_audio_queue_depth(wrapper->fs);
  releaseFrameSyncWrapper(wrapper);
  napi_value result;
  status = napi_create_int32(env, (int32_t)depth, &result);
  CHECK_STATUS;
  return result;
}
napi_value audioFormat(napi_env env, napi_callback_info info) {
  napi_status status;

  size_t argc = 0;
  napi_value thisValue;
  status = napi_get_cb_info(env, info, &argc, nullptr, &thisValue, nullptr);
  CHECK_STATUS;

  carrier c;
  framesyncWrapper *wrapper = nullptr;
  if (!acquireFrameSyncFromThis(env, thisValue, &wrapper, &c)) {
    napi_throw_error(env, nullptr,
                     c.errorMsg.empty() ? "FrameSync has been destroyed."
                                        : c.errorMsg.c_str());
    return nullptr;
  }

  NDIlib_audio_frame_v3_t frame{};
  NDIlib_framesync_capture_audio_v2(wrapper->fs, &frame, 0, 0, 0);
  int sampleRate = frame.sample_rate;
  int noChannels = frame.no_channels;
  NDIlib_framesync_free_audio_v2(wrapper->fs, &frame);
  releaseFrameSyncWrapper(wrapper);

  napi_value result;
  if (sampleRate <= 0 || noChannels <= 0) {
    status = napi_get_undefined(env, &result);
    CHECK_STATUS;
    return result;
  }

  status = napi_create_object(env, &result);
  CHECK_STATUS;
  napi_value value;
  status = napi_create_int32(env, sampleRate, &value);
  CHECK_STATUS;
  status = napi_set_named_property(env, result, "sampleRate", value);
  CHECK_STATUS;
  status = napi_create_int32(env, noChannels, &value);
  CHECK_STATUS;
  status = napi_set_named_property(env, result, "noChannels", value);
  CHECK_STATUS;
  return result;
}


void framesyncExecute(napi_env env, void *data) {
  framesyncCarrier *c = (framesyncCarrier *)data;
  c->fs = NDIlib_framesync_create(c->recv);
  if (!c->fs) {
    c->status = GRANDI_RECEIVE_CREATE_FAIL;
    c->errorMsg = "Failed to create NDI frame synchronizer.";
    return;
  }
}

napi_value framesyncVideo(napi_env env, napi_callback_info info);
napi_value framesyncAudio(napi_env env, napi_callback_info info);

void framesyncComplete(napi_env env, napi_status asyncStatus, void *data) {
  framesyncCarrier *c = (framesyncCarrier *)data;

  if (asyncStatus != napi_ok) {
    c->status = asyncStatus;
    c->errorMsg = "Async framesync creation failed to complete.";
  }
  REJECT_STATUS;

  napi_value result;
  c->status = napi_create_object(env, &result);
  REJECT_STATUS;

  framesyncWrapper *wrapper = new framesyncWrapper;
  wrapper->env = env;
  wrapper->fs = c->fs;
  wrapper->receiverRef = c->passthru;
  wrapper->recvHandle = c->recvHandle;
  c->passthru = nullptr;
  c->recvHandle = nullptr;

  napi_value embedded;
  c->status =
      napi_create_external(env, wrapper, finalizeFrameSync, nullptr, &embedded);
  if (c->status != napi_ok) {
    closeFrameSyncWrapper(env, wrapper);
    delete wrapper;
    REJECT_STATUS;
  }
  c->status = napi_set_named_property(env, result, "embedded", embedded);
  REJECT_STATUS;

  napi_value destroyFn;
  c->status = napi_create_function(env, "destroy", NAPI_AUTO_LENGTH,
                                   destroyFrameSync, nullptr, &destroyFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "destroy", destroyFn);
  REJECT_STATUS;

  napi_value videoFn;
  c->status = napi_create_function(env, "video", NAPI_AUTO_LENGTH,
                                   framesyncVideo, nullptr, &videoFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "video", videoFn);
  REJECT_STATUS;

  napi_value audioFn;
  c->status = napi_create_function(env, "audio", NAPI_AUTO_LENGTH,
                                   framesyncAudio, nullptr, &audioFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "audio", audioFn);
  REJECT_STATUS;
  napi_value audioFormatFn;
  c->status = napi_create_function(env, "audioFormat", NAPI_AUTO_LENGTH,
                                   audioFormat, nullptr, &audioFormatFn);
  REJECT_STATUS;
  c->status =
      napi_set_named_property(env, result, "audioFormat", audioFormatFn);
  REJECT_STATUS;


  napi_value audioQueueDepthFn;
  c->status =
      napi_create_function(env, "audioQueueDepth", NAPI_AUTO_LENGTH,
                           audioQueueDepth, nullptr, &audioQueueDepthFn);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "audioQueueDepth",
                                      audioQueueDepthFn);
  REJECT_STATUS;

  napi_status status = napi_resolve_deferred(env, c->_deferred, result);
  FLOATING_STATUS;

  tidyCarrier(env, c);
}

void framesyncVideoExecute(napi_env env, void *data) {
  framesyncVideoCarrier *c = (framesyncVideoCarrier *)data;
  NDIlib_framesync_capture_video(c->wrapper->fs, &c->videoFrame, c->fieldType);
  if (c->videoFrame.p_data == nullptr || c->videoFrame.xres == 0 ||
      c->videoFrame.yres == 0) {
    c->noVideo = true;
  }
}

void framesyncVideoComplete(napi_env env, napi_status asyncStatus, void *data) {
  framesyncVideoCarrier *c = (framesyncVideoCarrier *)data;

  if (asyncStatus != napi_ok) {
    c->status = asyncStatus;
    c->errorMsg = "Async framesync video capture failed to complete.";
  }
  REJECT_STATUS;

  FrameSyncVideoGuard guard(c);

  napi_value result;
  c->status = napi_create_object(env, &result);
  REJECT_STATUS;

  if (c->noVideo) {
    napi_value typeValue;
    c->status =
        napi_create_string_utf8(env, "timeout", NAPI_AUTO_LENGTH, &typeValue);
    REJECT_STATUS;
    c->status = napi_set_named_property(env, result, "type", typeValue);
    REJECT_STATUS;

    napi_status status = napi_resolve_deferred(env, c->_deferred, result);
    FLOATING_STATUS;
    tidyCarrier(env, c);
    return;
  }

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

  c->status = napi_create_bigint_int64(env, c->videoFrame.timestamp, &param);
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

  c->status = napi_create_bigint_int64(env, c->videoFrame.timecode, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "timecode", param);
  REJECT_STATUS;

  c->status = napi_create_int32(
      env, (int32_t)c->videoFrame.line_stride_in_bytes, &param);
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

  c->status = napi_create_buffer_copy(
      env, videoBytes, (void *)c->videoFrame.p_data, nullptr, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "data", param);
  REJECT_STATUS;

  napi_status status = napi_resolve_deferred(env, c->_deferred, result);
  FLOATING_STATUS;

  tidyCarrier(env, c);
}

napi_value framesyncVideo(napi_env env, napi_callback_info info) {
  napi_valuetype type;
  framesyncVideoCarrier *c = new framesyncVideoCarrier;

  napi_value promise;
  c->status = napi_create_promise(env, &c->_deferred, &promise);
  REJECT_RETURN;

  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  c->status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  REJECT_RETURN;

  if (!acquireFrameSyncFromThis(env, thisValue, &c->wrapper, c))
    REJECT_RETURN;

  if (argc >= 1) {
    napi_value fieldType = args[0];
    c->status = napi_typeof(env, fieldType, &type);
    REJECT_RETURN;
    if (type != napi_undefined) {
      if (type != napi_number)
        REJECT_ERROR_RETURN("fieldType must be a number.", GRANDI_INVALID_ARGS);
      int32_t enumValue;
      c->status = napi_get_value_int32(env, fieldType, &enumValue);
      REJECT_RETURN;
      c->fieldType = (NDIlib_frame_format_type_e)enumValue;
      if (!validFrameFormat(c->fieldType))
        REJECT_ERROR_RETURN("Invalid fieldType value.", GRANDI_INVALID_ARGS);
    }
  }

  napi_value resource_name;
  c->status = napi_create_string_utf8(env, "FrameSyncVideo", NAPI_AUTO_LENGTH,
                                      &resource_name);
  REJECT_RETURN;
  c->status =
      napi_create_async_work(env, NULL, resource_name, framesyncVideoExecute,
                             framesyncVideoComplete, c, &c->_request);
  REJECT_RETURN;
  c->status = napi_queue_async_work(env, c->_request);
  REJECT_RETURN;

  return promise;
}

void framesyncAudioExecute(napi_env env, void *data) {
  framesyncAudioCarrier *c = (framesyncAudioCarrier *)data;
  NDIlib_framesync_capture_audio_v2(c->wrapper->fs, &c->audioFrame,
                                    c->sampleRate, c->noChannels, c->noSamples);
}

void framesyncAudioComplete(napi_env env, napi_status asyncStatus, void *data) {
  framesyncAudioCarrier *c = (framesyncAudioCarrier *)data;

  if (asyncStatus != napi_ok) {
    c->status = asyncStatus;
    c->errorMsg = "Async framesync audio capture failed to complete.";
  }
  REJECT_STATUS;

  FrameSyncAudioGuard guard(c);

  napi_value result;
  c->status = napi_create_object(env, &result);
  REJECT_STATUS;

  napi_value param;
  c->status = napi_create_string_utf8(env, "audio", NAPI_AUTO_LENGTH, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "type", param);
  REJECT_STATUS;

  // audioFormat: Float32Separate
  c->status = napi_create_int32(env, 0, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "audioFormat", param);
  REJECT_STATUS;

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

  c->status = napi_create_int32(
      env, (int32_t)c->audioFrame.channel_stride_in_bytes, &param);
  REJECT_STATUS;
  c->status =
      napi_set_named_property(env, result, "channelStrideInBytes", param);
  REJECT_STATUS;

  c->status = napi_create_bigint_int64(env, c->audioFrame.timestamp, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "timestamp", param);
  REJECT_STATUS;

  c->status = napi_create_bigint_int64(env, c->audioFrame.timecode, &param);
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

  size_t audioBytes = 0;
  if (c->audioFrame.p_data != nullptr && c->audioFrame.no_channels > 0 &&
      c->audioFrame.channel_stride_in_bytes > 0) {
    audioBytes = (size_t)c->audioFrame.channel_stride_in_bytes *
                 (size_t)c->audioFrame.no_channels;
  }

  c->status = napi_create_buffer_copy(
      env, audioBytes, (void *)c->audioFrame.p_data, nullptr, &param);
  REJECT_STATUS;
  c->status = napi_set_named_property(env, result, "data", param);
  REJECT_STATUS;

  napi_status status = napi_resolve_deferred(env, c->_deferred, result);
  FLOATING_STATUS;

  tidyCarrier(env, c);
}

napi_value framesyncAudio(napi_env env, napi_callback_info info) {
  napi_valuetype type;
  framesyncAudioCarrier *c = new framesyncAudioCarrier;

  napi_value promise;
  c->status = napi_create_promise(env, &c->_deferred, &promise);
  REJECT_RETURN;

  size_t argc = 1;
  napi_value args[1];
  napi_value thisValue;
  c->status = napi_get_cb_info(env, info, &argc, args, &thisValue, nullptr);
  REJECT_RETURN;

  if (!acquireFrameSyncFromThis(env, thisValue, &c->wrapper, c))
    REJECT_RETURN;

  if (argc < 1)
    REJECT_ERROR_RETURN("options must be provided.", GRANDI_INVALID_ARGS);

  napi_value options = args[0];
  c->status = napi_typeof(env, options, &type);
  REJECT_RETURN;
  if (type != napi_object)
    REJECT_ERROR_RETURN("options must be an object.", GRANDI_INVALID_ARGS);

  napi_value sampleRateValue;
  c->status =
      napi_get_named_property(env, options, "sampleRate", &sampleRateValue);
  REJECT_RETURN;
  c->status = napi_typeof(env, sampleRateValue, &type);
  REJECT_RETURN;
  if (type != napi_undefined) {
    if (type != napi_number)
      REJECT_ERROR_RETURN("sampleRate must be a number.", GRANDI_INVALID_ARGS);
    c->status = napi_get_value_int32(env, sampleRateValue, &c->sampleRate);
    REJECT_RETURN;
  }

  napi_value channelsValue;
  c->status =
      napi_get_named_property(env, options, "noChannels", &channelsValue);
  REJECT_RETURN;
  c->status = napi_typeof(env, channelsValue, &type);
  REJECT_RETURN;
  if (type != napi_undefined) {
    if (type != napi_number)
      REJECT_ERROR_RETURN("noChannels must be a number.", GRANDI_INVALID_ARGS);
    c->status = napi_get_value_int32(env, channelsValue, &c->noChannels);
    REJECT_RETURN;
  }

  napi_value samplesValue;
  c->status =
      napi_get_named_property(env, options, "noSamples", &samplesValue);
  REJECT_RETURN;
  c->status = napi_typeof(env, samplesValue, &type);
  REJECT_RETURN;
  if (type != napi_number)
    REJECT_ERROR_RETURN("noSamples must be a number.", GRANDI_INVALID_ARGS);
  c->status = napi_get_value_int32(env, samplesValue, &c->noSamples);
  REJECT_RETURN;
  if (c->noSamples <= 0)
    REJECT_ERROR_RETURN("noSamples must be greater than zero.",
                        GRANDI_INVALID_ARGS);

  napi_value resource_name;
  c->status = napi_create_string_utf8(env, "FrameSyncAudio", NAPI_AUTO_LENGTH,
                                      &resource_name);
  REJECT_RETURN;
  c->status =
      napi_create_async_work(env, NULL, resource_name, framesyncAudioExecute,
                             framesyncAudioComplete, c, &c->_request);
  REJECT_RETURN;
  c->status = napi_queue_async_work(env, c->_request);
  REJECT_RETURN;

  return promise;
}
} // namespace

napi_value framesync(napi_env env, napi_callback_info info) {
  napi_valuetype type;
  framesyncCarrier *c = new framesyncCarrier;

  napi_value promise;
  c->status = napi_create_promise(env, &c->_deferred, &promise);
  REJECT_RETURN;

  size_t argc = 1;
  napi_value args[1];
  c->status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  REJECT_RETURN;

  if (argc < 1)
    REJECT_ERROR_RETURN("Receiver must be provided.", GRANDI_INVALID_ARGS);

  napi_value receiver = args[0];
  c->status = napi_typeof(env, receiver, &type);
  REJECT_RETURN;
  if (type != napi_object)
    REJECT_ERROR_RETURN("Receiver must be an object.", GRANDI_INVALID_ARGS);

  napi_value recvValue;
  c->status = napi_get_named_property(env, receiver, "embedded", &recvValue);
  REJECT_RETURN;
  c->status = napi_typeof(env, recvValue, &type);
  REJECT_RETURN;
  if (type != napi_external)
    REJECT_ERROR_RETURN("Receiver is not initialized.", GRANDI_INVALID_ARGS);

  void *externalData;
  c->status = napi_get_value_external(env, recvValue, &externalData);
  REJECT_RETURN;
  nativeHandle *recvHandle = (nativeHandle *)externalData;
  void *recvData;
  if (!acquireNativeHandle(recvHandle, &recvData))
    REJECT_ERROR_RETURN("Receiver has been destroyed.", GRANDI_INVALID_ARGS);
  c->recvHandle = recvHandle;
  c->recv = (NDIlib_recv_instance_t)recvData;

  napi_ref receiverRef;
  c->status = napi_create_reference(env, receiver, 1, &receiverRef);
  REJECT_RETURN;
  c->passthru = receiverRef;

  napi_value resource_name;
  c->status = napi_create_string_utf8(env, "FrameSync", NAPI_AUTO_LENGTH,
                                      &resource_name);
  REJECT_RETURN;
  c->status = napi_create_async_work(env, NULL, resource_name, framesyncExecute,
                                     framesyncComplete, c, &c->_request);
  REJECT_RETURN;
  c->status = napi_queue_async_work(env, c->_request);
  REJECT_RETURN;

  return promise;
}
