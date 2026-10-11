#!/bin/sh
# cgroup v2 in a container: a group with processes in it cannot hand its
# controllers down, so the container's own processes move to a child group
# (init) and every controller is delegated, as docker:dind's entrypoint does.
# Without it runc creates no pod ("controller cpu is not available").
set -eu

if [ -f /sys/fs/cgroup/cgroup.controllers ]; then
  mkdir -p /sys/fs/cgroup/init
  xargs -rn1 </sys/fs/cgroup/cgroup.procs >/sys/fs/cgroup/init/cgroup.procs 2>/dev/null || :
  sed -e 's/ / +/g' -e 's/^/+/' </sys/fs/cgroup/cgroup.controllers >/sys/fs/cgroup/cgroup.subtree_control
fi

# The other services reach the API server by this name too.
exec kubesolo --apiserver-extra-sans=kube "$@"
