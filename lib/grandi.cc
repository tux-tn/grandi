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

#include <cstdio>
#include <chrono>
#include <Processing.NDI.Lib.h>

#ifdef _WIN32
#ifdef _WIN64
#pragma comment(lib, "Processing.NDI.Lib.x64.lib")
#else // _WIN64
#pragma comment(lib, "Processing.NDI.Lib.x86.lib")
#endif // _WIN64
#endif // _WIN32

#include "grandi_util.h"
#include "grandi_find.h"
#include "grandi_send.h"
#include "grandi_receive.h"
#include "grandi_framesync.h"
#include "grandi_routing.h"
#include "node_api.h"

napi_value version(napi_env env, napi_callback_info info) {
  napi_status status;

  const char *ndiVersion = NDIlib_version();
  napi_value result;
  status = napi_create_string_utf8(env, ndiVersion, NAPI_AUTO_LENGTH, &result);
  CHECK_STATUS;

  return result;
}

napi_value isSupportedCPU(napi_env env, napi_callback_info info) {
  napi_status status;

  napi_value result;
  status = napi_get_boolean(env, NDIlib_is_supported_CPU(), &result);
  CHECK_STATUS;

  return result;
}

napi_value initialize(napi_env env, napi_callback_info info) {
  napi_status status;

  bool ok = NDIlib_initialize();
  napi_value result;
  status = napi_get_boolean(env, ok, &result);
  CHECK_STATUS;

  return result;
}

napi_value destroy(napi_env env, napi_callback_info info) {
  napi_status status;

  NDIlib_destroy();
  napi_value result;
  status = napi_get_boolean(env, true, &result);
  CHECK_STATUS;

  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_status status;
  napi_property_descriptor desc[] = {
      DECLARE_NAPI_METHOD("version", version),
      DECLARE_NAPI_METHOD("isSupportedCPU", isSupportedCPU),
      DECLARE_NAPI_METHOD("initialize", initialize),
      DECLARE_NAPI_METHOD("destroy", destroy),
      DECLARE_NAPI_METHOD("find", find),
      DECLARE_NAPI_METHOD("send", send),
      DECLARE_NAPI_METHOD("receive", receive),
      DECLARE_NAPI_METHOD("framesync", framesync),
      DECLARE_NAPI_METHOD("routing", routing)};
  status = napi_define_properties(env, exports, sizeof(desc) / sizeof(desc[0]),
                                  desc);
  CHECK_STATUS;

  return exports;
}

NAPI_MODULE(nodencl, Init)
