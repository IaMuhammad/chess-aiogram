"""End-to-end test against a live server (started separately on port 8078).

Two players join a friend game, play Fool's mate, and we verify move sync,
SAN, clocks, checkmate and rating updates.
"""
import asyncio
import json

import httpx
import websockets

BASE = "http://127.0.0.1:8078"
WS = "ws://127.0.0.1:8078"


async def recv_state(ws, want_plies=None, limit=40):
    for _ in range(limit):
        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
        if msg.get("type") == "state" and (want_plies is None or len(msg["game"]["sans"]) == want_plies):
            return msg
    raise AssertionError("no expected state")


async def main():
    async with httpx.AsyncClient(base_url=BASE) as c:
        me1 = (await c.get("/api/me", headers={"X-Dev-Id": "1"})).json()
        me2 = (await c.get("/api/me", headers={"X-Dev-Id": "2"})).json()
        print(f"P1={me1['name']}({me1['rating']}) P2={me2['name']}({me2['rating']})")

        created = (await c.post("/api/games/friend", json={"tc": "5+0"}, headers={"X-Dev-Id": "1"})).json()
        gid = created["gameId"]
        print("game:", gid, "invite:", created["inviteLink"])

        async with websockets.connect(f"{WS}/ws/game/{gid}?dev_id=1") as w1:
            s1 = await recv_state(w1)
            assert s1["you"]["color"] == "white" and s1["game"]["status"] == "waiting"
            async with websockets.connect(f"{WS}/ws/game/{gid}?dev_id=2") as w2:
                s2 = await recv_state(w2)
                assert s2["you"]["color"] == "black", s2["you"]
                sa = await recv_state(w1, want_plies=0)
                assert sa["game"]["status"] == "active"
                print("active; both seated")

                await w1.send(json.dumps({"type": "move", "uci": "e2e5"}))  # illegal
                err = json.loads(await asyncio.wait_for(w1.recv(), timeout=5))
                assert err["type"] == "error", err
                print("illegal rejected:", err["message"])

                st = None
                for i, (w, uci) in enumerate([(w1, "f2f3"), (w2, "e7e5"), (w1, "g2g4"), (w2, "d8h4")], 1):
                    await w.send(json.dumps({"type": "move", "uci": uci}))
                    st = await recv_state(w1, want_plies=i)
                    cl = st["game"]["clocks"]
                    print(f"  ply{i} {uci} SAN={st['game']['sans'][-1]} w={cl['white']:.0f} b={cl['black']:.0f}")

                g = st["game"]  # the 4th move's broadcast is the finished state
                assert g["status"] == "finished" and g["result"]["winner"] == "black", g["result"]
                assert g["sans"][-1] == "Qh4#", g["sans"]
                assert g["result"]["blackDelta"] > 0 > g["result"]["whiteDelta"]
                print("checkmate:", g["result"])

                # chat round-trip
                await w2.send(json.dumps({"type": "chat", "text": "gg"}))
                cs = await recv_state(w1)
                assert any(m["text"] == "gg" for m in cs["game"]["messages"])
                print("chat ok")

        me1b = (await c.get("/api/me", headers={"X-Dev-Id": "1"})).json()
        me2b = (await c.get("/api/me", headers={"X-Dev-Id": "2"})).json()
        print(f"after: P1 {me1b['rating']}({me1b['losses']}L) P2 {me2b['rating']}({me2b['wins']}W str{me2b['streak']})")
        assert me2b["rating"] > 1200 > me1b["rating"]
        assert me2b["wins"] == 1 and me1b["losses"] == 1 and me2b["streak"] == 1
        rec = (await c.get("/api/recent", headers={"X-Dev-Id": "2"})).json()
        assert len(rec) == 1 and rec[0]["result"] == "W", rec
        print("recent:", rec)
    print("\n✅ ALL E2E CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
