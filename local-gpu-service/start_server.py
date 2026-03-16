import time; import subprocess; subprocess.Popen(['rembg', 's', '--port', '7000', '--host', '0.0.0.0']); time.sleep(10); print('Server started')
