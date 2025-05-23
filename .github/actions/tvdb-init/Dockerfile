# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

# alpine:3.13
FROM alpine@sha256:08d6ca16c60fe7490c03d10dc339d9fd8ea67c6466dea8d558526b1330a85930

RUN architecture=$(uname -m) && \
    mkdir lib64 && \
    # Use musl libc where the go binary expects glibc
    # Less-generalized: ln -s /lib/ld-musl-x86_64.so.1 /lib64/ld-linux-x86-64.so.2
    ln -s /lib/ld-musl-${architecture}.so.[0-9] /lib64/ld-linux-${architecture//_/-}.so.2
ENV GOROOT=/usr/local/go \
    CGO_ENABLED=0

COPY entrypoint.sh dbconf.yml /

ENTRYPOINT /entrypoint.sh
