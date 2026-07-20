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

#ifndef GRANDI_FIND_H
#define GRANDI_FIND_H

#include "node_api.h"
#include "grandi_util.h"

napi_value find(napi_env, napi_callback_info);

struct findCarrier : carrier {

  bool show_local_sources = true;
  char *groups = nullptr;
  char *extra_ips = nullptr;
  NDIlib_find_instance_t find = nullptr;
  ~findCarrier() {
    if (groups != nullptr)
      free(groups);
    if (extra_ips != nullptr)
      free(extra_ips);
  }
};

struct findWaitCarrier : carrier {
  nativeHandle *handle = nullptr;
  NDIlib_find_instance_t find = nullptr;
  uint32_t wait = 10000;
  bool changed = false;
  ~findWaitCarrier() {
    if (handle != nullptr)
      releaseNativeHandle(handle);
  }
};

#endif /* GRANDI_FIND_H */
