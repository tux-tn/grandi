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

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <cmath>
#include <chrono>
#include <cstring>
#include <string>
#include <limits>
#include <algorithm>
#include <cstdlib>
#include <mutex>
#include <Processing.NDI.Lib.h>
#include "grandi_util.h"
#include "node_api.h"
using namespace std;

// Implementation of itoa()
char *custom_itoa(int num, char *str, int base) {
  int i = 0;
  bool isNegative = false;

  /* Handle 0 explicitely, otherwise empty string is printed for 0 */
  if (num == 0) {
    str[i++] = '0';
    str[i] = '\0';
    return str;
  }

  // In standard itoa(), negative numbers are handled only with
  // base 10. Otherwise numbers are considered unsigned.
  if (num < 0 && base == 10) {
    isNegative = true;
    num = -num;
  }

  // Process individual digits
  while (num != 0) {
    int rem = num % base;
    str[i++] = (rem > 9) ? (rem - 10) + 'a' : rem + '0';
    num = num / base;
  }

  // If number is negative, append '-'
  if (isNegative)
    str[i++] = '-';

  str[i] = '\0'; // Append string terminator

  std::reverse(str, str + i);

  return str;
}

napi_status checkStatus(napi_env env, napi_status status, const char *file,
                        uint32_t line) {

  napi_status infoStatus, throwStatus;
  const napi_extended_error_info *errorInfo;

  if (status == napi_ok) {
    return status;
  }

  infoStatus = napi_get_last_error_info(env, &errorInfo);
  assert(infoStatus == napi_ok);
  printf("NAPI error in file %s on line %i. Error %i: %s\n", file, line,
         errorInfo->error_code, errorInfo->error_message);

  if (status == napi_pending_exception) {
    printf("NAPI pending exception. Engine error code: %i\n",
           errorInfo->engine_error_code);
    return status;
  }

  char errorCode[20];
  throwStatus =
      napi_throw_error(env, custom_itoa(errorInfo->error_code, errorCode, 10),
                       errorInfo->error_message);
  assert(throwStatus == napi_ok);

  return napi_pending_exception; // Expect to be cast to void
}

long long microTime(std::chrono::high_resolution_clock::time_point start) {
  auto elapsed = std::chrono::high_resolution_clock::now() - start;
  return std::chrono::duration_cast<std::chrono::microseconds>(elapsed).count();
}

const char *getNapiTypeName(napi_valuetype t) {
  switch (t) {
  case napi_undefined:
    return "undefined";
  case napi_null:
    return "null";
  case napi_boolean:
    return "boolean";
  case napi_number:
    return "number";
  case napi_string:
    return "string";
  case napi_symbol:
    return "symbol";
  case napi_object:
    return "object";
  case napi_function:
    return "function";
  case napi_external:
    return "external";
  default:
    return "unknown";
  }
}

napi_status checkArgs(napi_env env, napi_callback_info info, char *methodName,
                      napi_value *args, size_t argc, napi_valuetype *types) {

  napi_status status;

  size_t realArgc = argc;
  status = napi_get_cb_info(env, info, &realArgc, args, nullptr, nullptr);
  if (status != napi_ok)
    return status;

  if (realArgc != argc) {
    char errorMsg[100];
    snprintf(errorMsg, sizeof(errorMsg),
             "For method %s, expected %zi arguments and got %zi.", methodName,
             argc, realArgc);
    napi_throw_error(env, nullptr, errorMsg);
    return napi_pending_exception;
  }

  napi_valuetype t;
  for (int x = 0; x < (int)argc; x++) {
    status = napi_typeof(env, args[x], &t);
    if (status != napi_ok)
      return status;
    if (t != types[x]) {
      char errorMsg[100];
      snprintf(errorMsg, sizeof(errorMsg),
               "For method %s argument %i, expected type %s and got %s.",
               methodName, x + 1, getNapiTypeName(types[x]),
               getNapiTypeName(t));
      napi_throw_error(env, nullptr, errorMsg);
      return napi_pending_exception;
    }
  }

  return napi_ok;
};

napi_status parseUint32Value(napi_env env, napi_value value,
                             const char *valueName, uint32_t *result,
                             std::string *error) {
  error->clear();
  napi_valuetype type;
  napi_status status = napi_typeof(env, value, &type);
  if (status != napi_ok)
    return status;

  if (type != napi_number) {
    *error = std::string(valueName) +
             " must be a finite integer between 0 and 4294967295.";
    return napi_ok;
  }

  double parsed;
  status = napi_get_value_double(env, value, &parsed);
  if (status != napi_ok)
    return status;
  if (!std::isfinite(parsed) || std::floor(parsed) != parsed || parsed < 0.0 ||
      parsed > std::numeric_limits<uint32_t>::max()) {
    *error = std::string(valueName) +
             " must be a finite integer between 0 and 4294967295.";
    return napi_ok;
  }

  *result = static_cast<uint32_t>(parsed);
  return napi_ok;
}

void tidyCarrier(napi_env env, carrier *c) {
  napi_status status;
  if (c->passthru != nullptr) {
    status = napi_delete_reference(env, c->passthru);
    FLOATING_STATUS;
  }
  if (c->_request != nullptr) {
    status = napi_delete_async_work(env, c->_request);
    FLOATING_STATUS;
  }
  delete c;
}

napi_status readUtf8StringValue(napi_env env, napi_value value,
                                std::unique_ptr<char[]> *result) {
  size_t length;
  napi_status status =
      napi_get_value_string_utf8(env, value, nullptr, 0, &length);
  if (status != napi_ok)
    return status;
  std::unique_ptr<char[]> buffer(new (std::nothrow) char[length + 1]);
  if (buffer == nullptr)
    return napi_generic_failure;
  size_t written;
  status = napi_get_value_string_utf8(env, value, buffer.get(), length + 1,
                                      &written);
  if (status != napi_ok)
    return status;
  *result = std::move(buffer);
  return napi_ok;
}

bool readUtf8String(napi_env env, napi_value value,
                    std::unique_ptr<char[]> *result, carrier *c) {
  c->status = readUtf8StringValue(env, value, result);
  if (c->status == napi_generic_failure) {
    c->status = GRANDI_ALLOCATION_FAILURE;
    c->errorMsg = "Failed to allocate UTF-8 string buffer.";
  }
  return c->status == napi_ok;
}

ownedBuffer::~ownedBuffer() { free(data); }

bool ownedBuffer::allocate(size_t length) {
  free(data);
  data = nullptr;
  size = 0;
  if (length == 0)
    return true;
  data = malloc(length);
  if (data == nullptr)
    return false;
  size = length;
  return true;
}

bool ownedBuffer::copyFrom(const void *source, size_t length) {
  if (length > 0 && source == nullptr)
    return false;
  if (!allocate(length))
    return false;
  if (length > 0)
    memcpy(data, source, length);
  return true;
}

void finalizeOwnedBuffer(napi_env env, void *data, void *hint) { free(data); }

napi_status createExternalBuffer(napi_env env, ownedBuffer *buffer,
                                 napi_value *result) {
  if (buffer->size == 0)
    return napi_create_buffer(env, 0, nullptr, result);
  napi_status status = napi_create_external_buffer(
      env, buffer->size, buffer->data, finalizeOwnedBuffer, nullptr, result);
  if (status == napi_ok) {
    buffer->data = nullptr;
    buffer->size = 0;
  }
  return status;
}

nativeHandle *createNativeHandle(void *value, void (*destroy)(void *)) {
  nativeHandle *handle = new (std::nothrow) nativeHandle;
  if (handle == nullptr)
    return nullptr;
  handle->value = value;
  handle->destroy = destroy;
  return handle;
}

bool acquireNativeHandle(nativeHandle *handle, void **value) {
  if (handle == nullptr)
    return false;
  std::lock_guard<std::mutex> lock(handle->mutex);
  if (handle->closing || handle->value == nullptr)
    return false;
  handle->active++;
  *value = handle->value;
  return true;
}
nativeCaptureStatus acquireNativeCaptureHandle(nativeHandle *handle,
                                               void **value) {
  if (handle == nullptr)
    return nativeCaptureStatus::destroyed;
  std::lock_guard<std::mutex> lock(handle->mutex);
  if (handle->closing || handle->value == nullptr)
    return nativeCaptureStatus::destroyed;
  if (handle->captureBound)
    return nativeCaptureStatus::bound;
  handle->active++;
  *value = handle->value;
  return nativeCaptureStatus::success;
}

nativeCaptureStatus bindNativeCaptureHandle(nativeHandle *handle,
                                            void **value) {
  if (handle == nullptr)
    return nativeCaptureStatus::destroyed;
  std::lock_guard<std::mutex> lock(handle->mutex);
  if (handle->closing || handle->value == nullptr)
    return nativeCaptureStatus::destroyed;
  if (handle->captureBound)
    return nativeCaptureStatus::bound;
  if (handle->active != 0)
    return nativeCaptureStatus::busy;
  handle->captureBound = true;
  handle->active++;
  *value = handle->value;
  return nativeCaptureStatus::success;
}

void releaseNativeCaptureBinding(nativeHandle *handle) {
  if (handle == nullptr)
    return;
  {
    std::lock_guard<std::mutex> lock(handle->mutex);
    handle->captureBound = false;
  }
  releaseNativeHandle(handle);
}

void releaseNativeHandle(nativeHandle *handle) {
  if (handle == nullptr)
    return;
  void *valueToDestroy = nullptr;
  void (*destroy)(void *) = nullptr;
  bool deleteHandle = false;
  {
    std::lock_guard<std::mutex> lock(handle->mutex);
    if (handle->active > 0)
      handle->active--;
    if (handle->closing && handle->active == 0 && handle->value != nullptr) {
      valueToDestroy = handle->value;
      destroy = handle->destroy;
      handle->value = nullptr;
    }
    deleteHandle = handle->finalized && handle->active == 0;
  }
  if (destroy != nullptr && valueToDestroy != nullptr)
    destroy(valueToDestroy);
  if (deleteHandle)
    delete handle;
}
nativeHandleGuard::nativeHandleGuard(nativeHandle *handle) : handle(handle) {}

nativeHandleGuard::~nativeHandleGuard() {
  if (handle != nullptr)
    releaseNativeHandle(handle);
}

bool closeNativeHandle(nativeHandle *handle) {
  if (handle == nullptr)
    return false;
  void *valueToDestroy = nullptr;
  void (*destroy)(void *) = nullptr;
  bool hadValue = false;
  {
    std::lock_guard<std::mutex> lock(handle->mutex);
    hadValue = handle->value != nullptr;
    handle->closing = true;
    if (handle->active == 0 && handle->value != nullptr) {
      valueToDestroy = handle->value;
      destroy = handle->destroy;
      handle->value = nullptr;
    }
  }
  if (destroy != nullptr && valueToDestroy != nullptr)
    destroy(valueToDestroy);
  return hadValue;
}

void finalizeNativeHandle(napi_env env, void *data, void *hint) {
  nativeHandle *handle = (nativeHandle *)data;
  void *valueToDestroy = nullptr;
  void (*destroy)(void *) = nullptr;
  bool deleteHandle = false;
  {
    std::lock_guard<std::mutex> lock(handle->mutex);
    handle->finalized = true;
    handle->closing = true;
    if (handle->active == 0 && handle->value != nullptr) {
      valueToDestroy = handle->value;
      destroy = handle->destroy;
      handle->value = nullptr;
    }
    deleteHandle = handle->active == 0;
  }
  if (destroy != nullptr && valueToDestroy != nullptr)
    destroy(valueToDestroy);
  if (deleteHandle)
    delete handle;
}

int32_t rejectStatus(napi_env env, carrier *c, const char *file, int32_t line) {
  int32_t statusCode = c->status;
  if (c->status != GRANDI_SUCCESS) {
    napi_value errorValue, errorCode, errorMsg;
    napi_status status;
    char errorChars[20];
    if (c->status < GRANDI_ERROR_START) {
      const napi_extended_error_info *errorInfo;
      status = napi_get_last_error_info(env, &errorInfo);
      FLOATING_STATUS;
      c->errorMsg = std::string(errorInfo->error_message);
    }
    char extMsg[1024];
    snprintf(extMsg, sizeof(extMsg), "In file %s on line %i, found error: %s",
             file, line, c->errorMsg.c_str());
    status =
        napi_create_string_utf8(env, custom_itoa(c->status, errorChars, 10),
                                NAPI_AUTO_LENGTH, &errorCode);
    FLOATING_STATUS;
    status = napi_create_string_utf8(env, extMsg, NAPI_AUTO_LENGTH, &errorMsg);
    FLOATING_STATUS;
    status = napi_create_error(env, errorCode, errorMsg, &errorValue);
    FLOATING_STATUS;
    status = napi_reject_deferred(env, c->_deferred, errorValue);
    FLOATING_STATUS;

    tidyCarrier(env, c);
  }
  return statusCode;
}

bool validColorFormat(NDIlib_recv_color_format_e format) {
  switch (format) {
  case NDIlib_recv_color_format_BGRX_BGRA:
  case NDIlib_recv_color_format_UYVY_BGRA:
  case NDIlib_recv_color_format_RGBX_RGBA:
  case NDIlib_recv_color_format_UYVY_RGBA:
  case NDIlib_recv_color_format_best:
  case NDIlib_recv_color_format_fastest:
#ifdef _WIN32
  case NDIlib_recv_color_format_BGRX_BGRA_flipped:
#endif
    return true;
  default:
    return false;
  }
}

bool validBandwidth(NDIlib_recv_bandwidth_e bandwidth) {
  switch (bandwidth) {
  case NDIlib_recv_bandwidth_metadata_only:
  case NDIlib_recv_bandwidth_audio_only:
  case NDIlib_recv_bandwidth_lowest:
  case NDIlib_recv_bandwidth_highest:
    return true;
  default:
    return false;
  }
}

bool validFrameFormat(NDIlib_frame_format_type_e format) {
  switch (format) {
  case NDIlib_frame_format_type_progressive:
  case NDIlib_frame_format_type_interleaved:
  case NDIlib_frame_format_type_field_0:
  case NDIlib_frame_format_type_field_1:
    return true;
  default:
    return false;
  }
}

bool validAudioFormat(Grandi_audio_format_e format) {
  switch (format) {
  case Grandi_audio_format_float_32_separate:
  case Grandi_audio_format_int_16_interleaved:
  case Grandi_audio_format_float_32_interleaved:
    return true;
  default:
    return false;
  }
}

size_t videoDataSize(const NDIlib_video_frame_v2_t &frame) {
  size_t stride = static_cast<size_t>(std::abs(frame.line_stride_in_bytes));
  size_t lines = static_cast<size_t>(frame.yres);
  size_t pixelsPerLine = static_cast<size_t>(frame.xres);

  if (stride == 0) {
    switch (frame.FourCC) {
    case NDIlib_FourCC_type_UYVY:
    case NDIlib_FourCC_type_UYVA:
      stride = pixelsPerLine * 2;
      break;
    case NDIlib_FourCC_type_BGRA:
    case NDIlib_FourCC_type_BGRX:
    case NDIlib_FourCC_type_RGBA:
    case NDIlib_FourCC_type_RGBX:
      stride = pixelsPerLine * 4;
      break;
    case NDIlib_FourCC_type_P216:
    case NDIlib_FourCC_type_PA16:
      stride = pixelsPerLine * sizeof(uint16_t);
      break;
    default:
      break;
    }
  }

  switch (frame.FourCC) {
  case NDIlib_FourCC_type_UYVA:
    // UYVY plane uses line_stride_in_bytes; alpha plane follows immediately
    // and uses stride/2 bytes per line (see NDI docs custom allocator example).
    return stride * lines + (stride / 2) * lines;
  case NDIlib_FourCC_type_P216:
    return stride * lines * 2; // Y plane + UV plane
  case NDIlib_FourCC_type_PA16:
    return stride * lines * 3; // Y plane + UV plane + alpha plane
  case NDIlib_FourCC_type_YV12:
  case NDIlib_FourCC_type_I420:
  case NDIlib_FourCC_type_NV12:
    return stride * lines + (stride * lines) / 2; // 4:2:0 layouts
  default:
    return stride * lines; // Single-plane formats
  }
}

// Make a native source object from components of a source object
napi_status makeNativeSource(napi_env env, napi_value source,
                             nativeSource *result) {
  result->value = {};
  result->name.reset();
  result->urlAddress.reset();

  napi_value nameValue, urlValue;
  napi_status status = napi_get_named_property(env, source, "name", &nameValue);
  PASS_STATUS;
  status = napi_get_named_property(env, source, "urlAddress", &urlValue);
  PASS_STATUS;

  napi_valuetype type;
  status = napi_typeof(env, nameValue, &type);
  PASS_STATUS;
  if (type == napi_string) {
    status = readUtf8StringValue(env, nameValue, &result->name);
    PASS_STATUS;
    result->value.p_ndi_name = result->name.get();
  }

  status = napi_typeof(env, urlValue, &type);
  PASS_STATUS;
  if (type == napi_string) {
    status = readUtf8StringValue(env, urlValue, &result->urlAddress);
    PASS_STATUS;
    result->value.p_url_address = result->urlAddress.get();
  }

  return napi_ok;
}
