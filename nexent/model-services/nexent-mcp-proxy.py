import asyncio
import sys

LISTEN_HOST = sys.argv[1] if len(sys.argv) > 1 else '0.0.0.0'
LISTEN_PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8090
TARGET_HOST = sys.argv[3] if len(sys.argv) > 3 else '172.24.208.1'
TARGET_PORT = int(sys.argv[4]) if len(sys.argv) > 4 else 8090

async def pipe(reader, writer):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass

async def handle(client_reader, client_writer):
    try:
        remote_reader, remote_writer = await asyncio.open_connection(TARGET_HOST, TARGET_PORT)
        await asyncio.gather(
            pipe(client_reader, remote_writer),
            pipe(remote_reader, client_writer),
        )
    except Exception as exc:
        print(f'proxy error: {exc}', flush=True)
    finally:
        client_writer.close()
        try:
            await client_writer.wait_closed()
        except Exception:
            pass

async def main():
    server = await asyncio.start_server(handle, LISTEN_HOST, LISTEN_PORT)
    print(f'forwarding {LISTEN_HOST}:{LISTEN_PORT} -> {TARGET_HOST}:{TARGET_PORT}', flush=True)
    async with server:
        await server.serve_forever()

asyncio.run(main())
