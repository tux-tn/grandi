{
  "variables": {
    "ndi_dir": "<(module_root_dir)/ndi",
    "ndi_include_dir": "<(ndi_dir)/include",
    "product_dir": "<(PRODUCT_DIR)"
  },
  "targets": [
    {
      "target_name": "grandi",
      "sources": [
        "lib/grandi_util.cc",
        "lib/grandi_find.cc",
        "lib/grandi_send.cc",
        "lib/grandi_receive.cc",
        "lib/grandi_framesync.cc",
        "lib/grandi_routing.cc",
        "lib/grandi.cc"
      ],
      "include_dirs": [
        "<(ndi_include_dir)"
      ],
      "copies": [
        {
          "destination": "<(product_dir)",
          "files": [
            "<(ndi_dir)/lib/libndi_licenses.txt"
          ]
        }
      ],
      "conditions": [
        [
          "OS == 'win' and target_arch == 'ia32'",
          {
            "copies": [
              {
                "destination": "<(product_dir)",
                "files": [
                  "<(ndi_dir)/lib/win-x86/Processing.NDI.Lib.x86.dll",
                  "<(ndi_dir)/lib/LICENSE.pdf"
                ]
              }
            ],
            "link_settings": {
              "libraries": [
                "Processing.NDI.Lib.x86.lib"
              ],
              "library_dirs": [
                "<(ndi_dir)/lib/win-x86"
              ]
            }
          }
        ],
        [
          "OS == 'win' and target_arch == 'x64'",
          {
            "copies": [
              {
                "destination": "<(product_dir)",
                "files": [
                  "<(ndi_dir)/lib/win-x64/Processing.NDI.Lib.x64.dll",
                  "<(ndi_dir)/lib/LICENSE.pdf"
                ]
              }
            ],
            "link_settings": {
              "libraries": [
                "Processing.NDI.Lib.x64.lib"
              ],
              "library_dirs": [
                "<(ndi_dir)/lib/win-x64"
              ]
            }
          }
        ],
        [
          "OS == 'linux' and target_arch == 'ia32'",
          {
            "copies": [
              {
                "destination": "<(product_dir)",
                "files": [
                  "<(ndi_dir)/lib/lnx-x86/libndi.so.6",
                  "<(ndi_dir)/lib/LICENSE",
                ]
              }
            ],
            "link_settings": {
              "ldflags": [
                "-Wl,-rpath,'$$ORIGIN'"
              ],
              "libraries": [
                "-lndi"
              ],
              "library_dirs": [
                "<(ndi_dir)/lib/lnx-x86"
              ]
            }
          }
        ],
        [
          "OS == 'linux' and target_arch == 'x64'",
          {
            "copies": [
              {
                "destination": "<(product_dir)",
                "files": [
                  "<(ndi_dir)/lib/lnx-x64/libndi.so.6",
                  "<(ndi_dir)/lib/LICENSE"
                ]
              }
            ],
            "link_settings": {
              "ldflags": [
                "-Wl,-rpath,'$$ORIGIN'"
              ],
              "libraries": [
                "-lndi"
              ],
              "library_dirs": [
                "<(ndi_dir)/lib/lnx-x64"
              ]
            }
          }
        ],
        [
          "OS == 'linux' and target_arch == 'arm'",
          {
            "copies": [
              {
                "destination": "<(product_dir)",
                "files": [
                  "<(ndi_dir)/lib/lnx-armv7l/libndi.so.6",
                  "<(ndi_dir)/lib/LICENSE"
                ]
              }
            ],
            "link_settings": {
              "ldflags": [
                "-Wl,-rpath,'$$ORIGIN'"
              ],
              "libraries": [
                "-lndi"
              ],
              "library_dirs": [
                "<(ndi_dir)/lib/lnx-armv7l"
              ]
            }
          }
        ],
        [
          "OS == 'linux' and target_arch == 'arm64'",
          {
            "copies": [
              {
                "destination": "<(product_dir)",
                "files": [
                  "<(ndi_dir)/lib/lnx-arm64/libndi.so.6",
                  "<(ndi_dir)/lib/LICENSE"
                ]
              }
            ],
            "link_settings": {
              "ldflags": [
                "-Wl,-rpath,'$$ORIGIN'"
              ],
              "libraries": [
                "-lndi"
              ],
              "library_dirs": [
                "<(ndi_dir)/lib/lnx-arm64"
              ]
            }
          }
        ],
        [
          "OS == 'mac'",
          {
            "copies": [
              {
                "destination": "<(product_dir)",
                "files": [
                  "<(ndi_dir)/lib/macOS/libndi.dylib",
                  "<(ndi_dir)/lib/LICENSE.pdf"
                ]
              }
            ],
            "link_settings": {
              "libraries": [
                "-Wl,-rpath,@loader_path",
                "-lndi"
              ],
              "library_dirs": [
                "<(ndi_dir)/lib/macOS"
              ]
            }
          }
        ]
      ]
    }
  ]
}
