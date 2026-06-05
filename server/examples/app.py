from fastapi import FastAPI
from fastapi_socketio import SocketManager

app = FastAPI()
sio = SocketManager(app=app)


@app.sio.on('join')
async def handle_join(sid, *args, **kwargs):
    await sio.emit('lobby', 'User joined')


@sio.on('test')
async def test(sid, *args, **kwargs):
    await sio.emit('hey', 'joe')



if __name__ == '__main__':
    import logging
    import sys
    import os

    # Add the parent directory to sys.path and PYTHONPATH so that uvicorn can find 'examples'
    parent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    sys.path.insert(0, parent_dir)
    os.environ["PYTHONPATH"] = parent_dir + os.path.pathsep + os.environ.get("PYTHONPATH", "")

    logging.basicConfig(level=logging.DEBUG,
                        stream=sys.stdout)

    import uvicorn

    uvicorn.run("examples.app:app", host='0.0.0.0', port=8000, reload=True)
