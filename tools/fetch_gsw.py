# -*- coding: utf-8 -*-
"""抓勇士赛程 + 库里伤停，写成 assets/gsw-live.json 给前端读。

用法：python tools/fetch_gsw.py
输出：assets/gsw-live.json
"""
import json
import os
import subprocess
import datetime

SCHEDULE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/gsw/schedule"
INJURIES = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "assets", "gsw-live.json")


def get_json(url):
    """用 curl 取，避开 urllib 在某些网络下的握手问题。"""
    raw = subprocess.check_output(
        ["curl", "-s", "-m", "25", "-H", "User-Agent: Mozilla/5.0", url]
    )
    return json.loads(raw.decode("utf-8"))


def to_local(iso):
    if not iso:
        return None
    s = iso.replace("Z", "+00:00")
    try:
        return datetime.datetime.fromisoformat(s).astimezone()
    except ValueError:
        return None


def main():
    now = datetime.datetime.now().astimezone()
    out = {
        "updated": now.isoformat(timespec="seconds"),
        "games": [],
        "curry": None,
    }

    # ---------- 赛程 ----------
    try:
        d = get_json(SCHEDULE)
        for e in d.get("events", []):
            dt = to_local(e.get("date"))
            if not dt:
                continue
            comp = (e.get("competitions") or [{}])[0]
            me = foe = None
            for t in comp.get("competitors", []):
                ab = (t.get("team") or {}).get("abbreviation", "")
                if ab in ("GS", "GSW"):
                    me = t
                else:
                    foe = t
            st = ((comp.get("status") or {}).get("type") or {})
            notes = comp.get("notes") or []
            out["games"].append({
                "date": dt.strftime("%Y-%m-%d"),
                "time": dt.strftime("%H:%M"),
                "opp": ((foe or {}).get("team") or {}).get("abbreviation", "?"),
                "home": bool(me and me.get("homeAway") == "home"),
                "state": st.get("state", "pre"),
                "done": bool(st.get("completed")),
                "score": "%s-%s" % (
                    ((me or {}).get("score") or {}).get("displayValue", "") or "",
                    ((foe or {}).get("score") or {}).get("displayValue", "") or "",
                ),
                "win": bool((me or {}).get("winner")),
                "note": (notes[0].get("headline", "") if notes else ""),
            })
    except Exception as ex:  # noqa: BLE001
        out["error_schedule"] = str(ex)

    # ---------- 库里 ----------
    try:
        d = get_json(INJURIES)
        found = False
        for t in d.get("injuries", []):
            if "Warriors" not in (t.get("displayName") or ""):
                continue
            for p in t.get("injuries", []):
                name = ((p.get("athlete") or {}).get("displayName") or "")
                if "Curry" in name:
                    out["curry"] = {
                        "name": name,
                        "status": p.get("status", ""),
                        "note": p.get("shortComment") or p.get("longComment") or "",
                        "asOf": p.get("date", ""),
                    }
                    found = True
            break
        if not found:
            out["curry"] = {
                "name": "Stephen Curry",
                "status": "健康",
                "note": "勇士伤病名单里没有他",
                "asOf": out["updated"],
            }
    except Exception as ex:  # noqa: BLE001
        out["error_injuries"] = str(ex)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print("wrote %s" % OUT)
    print("games=%d curry=%s" % (len(out["games"]), out["curry"]))
    if out.get("error_schedule"):
        print("ERR schedule:", out["error_schedule"])
    if out.get("error_injuries"):
        print("ERR injuries:", out["error_injuries"])


if __name__ == "__main__":
    main()
