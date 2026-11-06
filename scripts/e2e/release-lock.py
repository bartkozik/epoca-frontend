"""Hold a kernel flock until the owning cleanup worker closes its private pipe."""
import fcntl
import os
import sys

fd = os.open(sys.argv[1], os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
try:
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        sys.exit(75)
    print("locked", flush=True)
    sys.stdin.buffer.read()
finally:
    os.close(fd)
