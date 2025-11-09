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
#include <chrono>
#include <string>
#include <algorithm>
#include <Processing.NDI.Lib.h>
#include "grandi_util.h"
#include "node_api.h"
using namespace std;

// Implementation of itoa()
char *custom_itoa(int num, char *str, int base)
{
  int i = 0;
  bool isNegative = false;

  /* Handle 0 explicitely, otherwise empty string is printed for 0 */
  if (num == 0)
  {
    str[i++] = '0';
    str[i] = '\0';
    return str;
  }

  // In standard itoa(), negative numbers are handled only with
  // base 10. Otherwise numbers are considered unsigned.
  if (num < 0 && base == 10)
  {
    isNegative = true;
    num = -num;
  }

  // Process individual digits
  while (num != 0)
  {
    int rem = num % base;
    str[i++] = (rem > 9) ? (rem - 10) + 'a' : rem + '0';
    num = num / base;
  }

  // If number is negative, append '-'
  if (isNegative)
    str[i++] = '-';

  str[i] = '\0'; // Append string terminator

  // Reverse the string
  std::reverse(std::string(str).begin(), std::string(str).end());

  return str;
}

napi_status checkStatus(napi_env env, napi_status status,
                        const char *file, uint32_t line)
{

  napi_status infoStatus, throwStatus;
  const napi_extended_error_info *errorInfo;

  if (status == napi_ok)
  {
    return status;
  }

  infoStatus = napi_get_last_error_info(env, &errorInfo);
  assert(infoStatus == napi_ok);
  printf("NAPI error in file %s on line %i. Error %i: %s\n", file, line,
         errorInfo->error_code, errorInfo->error_message);

  if (status == napi_pending_exception)
  {
    printf("NAPI pending exception. Engine error code: %i\n", errorInfo->engine_error_code);
    return status;
  }

  char errorCode[20];
  throwStatus = napi_throw_error(env,
                                 custom_itoa(errorInfo->error_code, errorCode, 10), errorInfo->error_message);
  assert(throwStatus == napi_ok);

  return napi_pending_exception; // Expect to be cast to void
}

long long microTime(std::chrono::high_resolution_clock::time_point start)
{
  auto elapsed = std::chrono::high_resolution_clock::now() - start;
  return std::chrono::duration_cast<std::chrono::microseconds>(elapsed).count();
}

const char *getNapiTypeName(napi_valuetype t)
{
  switch (t)
  {
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
                      napi_value *args, size_t argc, napi_valuetype *types)
{

  napi_status status;

  size_t realArgc = argc;
  status = napi_get_cb_info(env, info, &realArgc, args, nullptr, nullptr);
  if (status != napi_ok)
    return status;

  if (realArgc != argc)
  {
    char errorMsg[100];
    sprintf(errorMsg, "For method %s, expected %zi arguments and got %zi.",
            methodName, argc, realArgc);
    napi_throw_error(env, nullptr, errorMsg);
    return napi_pending_exception;
  }

  napi_valuetype t;
  for (int x = 0; x < (int)argc; x++)
  {
    status = napi_typeof(env, args[x], &t);
    if (status != napi_ok)
      return status;
    if (t != types[x])
    {
      char errorMsg[100];
      sprintf(errorMsg, "For method %s argument %i, expected type %s and got %s.",
              methodName, x + 1, getNapiTypeName(types[x]), getNapiTypeName(t));
      napi_throw_error(env, nullptr, errorMsg);
      return napi_pending_exception;
    }
  }

  return napi_ok;
};

void tidyCarrier(napi_env env, carrier *c)
{
  napi_status status;
  if (c->passthru != nullptr)
  {
    status = napi_delete_reference(env, c->passthru);
    FLOATING_STATUS;
  }
  if (c->_request != nullptr)
  {
    status = napi_delete_async_work(env, c->_request);
    FLOATING_STATUS;
  }
  delete c;
}

int32_t rejectStatus(napi_env env, carrier *c, const char *file, int32_t line)
{
  if (c->status != GRANDI_SUCCESS)
  {
    napi_value errorValue, errorCode, errorMsg;
    napi_status status;
    char errorChars[20];
    if (c->status < GRANDI_ERROR_START)
    {
      const napi_extended_error_info *errorInfo;
      status = napi_get_last_error_info(env, &errorInfo);
      FLOATING_STATUS;
      c->errorMsg = std::string(errorInfo->error_message);
    }
    char *extMsg = (char *)malloc(sizeof(char) * c->errorMsg.length() + 200);
    sprintf(extMsg, "In file %s on line %i, found error: %s", file, line, c->errorMsg.c_str());
    status = napi_create_string_utf8(env, custom_itoa(c->status, errorChars, 10),
                                     NAPI_AUTO_LENGTH, &errorCode);
    FLOATING_STATUS;
    status = napi_create_string_utf8(env, extMsg, NAPI_AUTO_LENGTH, &errorMsg);
    FLOATING_STATUS;
    status = napi_create_error(env, errorCode, errorMsg, &errorValue);
    FLOATING_STATUS;
    status = napi_reject_deferred(env, c->_deferred, errorValue);
    FLOATING_STATUS;

    // free(extMsg);
    tidyCarrier(env, c);
  }
  return c->status;
}

bool validColorFormat(NDIlib_recv_color_format_e format)
{
  switch (format)
  {
  case NDIlib_recv_color_format_BGRX_BGRA:
  case NDIlib_recv_color_format_UYVY_BGRA:
  case NDIlib_recv_color_format_RGBX_RGBA:
  case NDIlib_recv_color_format_UYVY_RGBA:
  case NDIlib_recv_color_format_fastest:
#ifdef _WIN32
  case NDIlib_recv_color_format_BGRX_BGRA_flipped:
#endif
    return true;
  default:
    return false;
  }
}

bool validBandwidth(NDIlib_recv_bandwidth_e bandwidth)
{
  switch (bandwidth)
  {
  case NDIlib_recv_bandwidth_metadata_only:
  case NDIlib_recv_bandwidth_audio_only:
  case NDIlib_recv_bandwidth_lowest:
  case NDIlib_recv_bandwidth_highest:
    return true;
  default:
    return false;
  }
}

bool validFrameFormat(NDIlib_frame_format_type_e format)
{
  switch (format)
  {
  case NDIlib_frame_format_type_progressive:
  case NDIlib_frame_format_type_interleaved:
  case NDIlib_frame_format_type_field_0:
  case NDIlib_frame_format_type_field_1:
    return true;
  default:
    return false;
  }
}

bool validAudioFormat(Grandi_audio_format_e format)
{
  switch (format)
  {
  case Grandi_audio_format_float_32_separate:
  case Grandi_audio_format_int_16_interleaved:
  case Grandi_audio_format_float_32_interleaved:
    return true;
  default:
    return false;
  }
}

// Make a native source object from components of a source object
napi_status makeNativeSource(napi_env env, napi_value source, NDIlib_source_t *result)
{
  result->p_ndi_name = nullptr;
  result->p_url_address = nullptr;

  napi_status status;
  napi_valuetype type;
  napi_value namev, urlv;
  size_t namel, urll;
  char *name = nullptr;
  char *url = nullptr;

  status = napi_get_named_property(env, source, "name", &namev);
  PASS_STATUS;
  status = napi_get_named_property(env, source, "urlAddress", &urlv);
  PASS_STATUS;

  status = napi_typeof(env, namev, &type);
  PASS_STATUS;
  if (type == napi_string)
  {
    status = napi_get_value_string_utf8(env, namev, nullptr, 0, &namel);
    PASS_STATUS;
    name = (char *)malloc(namel + 1);
    if (!name)
      return napi_generic_failure;
    status = napi_get_value_string_utf8(env, namev, name, namel + 1, &namel);
    if (status != napi_ok)
    {
      free(name);
      return status;
    }
  }

  status = napi_typeof(env, urlv, &type);
  PASS_STATUS;
  if (type == napi_string)
  {
    status = napi_get_value_string_utf8(env, urlv, nullptr, 0, &urll);
    PASS_STATUS;
    url = (char *)malloc(urll + 1);
    if (!url)
    {
      free(name);
      return napi_generic_failure;
    }
    status = napi_get_value_string_utf8(env, urlv, url, urll + 1, &urll);
    if (status != napi_ok)
    {
      free(name);
      free(url);
      return status;
    }
  }

  result->p_ndi_name = name;
  result->p_url_address = url;
  return napi_ok;
}

void freeNativeSource(NDIlib_source_t *result)
{
  if (result == nullptr)
    return;
  if (result->p_ndi_name != nullptr)
  {
    free((void *)result->p_ndi_name);
    result->p_ndi_name = nullptr;
  }
  if (result->p_url_address != nullptr)
  {
    free((void *)result->p_url_address);
    result->p_url_address = nullptr;
  }
}
