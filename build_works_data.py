#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从《吴承学教授简介》docx 生成站点「著述表」数据。

用法：
    python3 build_works_data.py

输入：吴承学教授简介（20260803）.docx
输出：site/assets/data/works.json

设计原则：
  - 只做「结构化切分」，不篡改原文。每条都保留 raw 原文，前端可回退显示。
  - 老师日后增补条目，只需更新 docx 再重跑本脚本，无需改前端代码。
"""

import datetime
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DOCX = ROOT / "吴承学教授简介（20260803）.docx"
OUT = ROOT / "site" / "assets" / "data" / "works.json"

CN_NUM = "一二三四五六七八九十"
RE_H1 = re.compile(r"^【(.+?)】$")
RE_H2 = re.compile(r"^([" + CN_NUM + r"]+)、(.+)$")
RE_H3 = re.compile(r"^（([" + CN_NUM + r"]+)）(.+)$")
RE_YEAR = re.compile(r"^(\d{4})年$")
RE_ITEM = re.compile(r"^《(.+?)》(.*)$", re.S)
RE_NUM_ITEM = re.compile(r"^(\d+)[．.、]\s*(.+)$")


# --------------------------------------------------------------------------
# 读取
# --------------------------------------------------------------------------
def read_paragraphs(path: Path):
    """按段落抽取 docx 纯文本（保持原始顺序）。"""
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    lines = []
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
        t = "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S))
        t = re.sub(r"<[^>]+>", "", t)
        t = (
            t.replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("\u200f", "")
            .replace("\ufeff", "")
            .strip()
        )
        if t:
            lines.append(t)
    return lines


# --------------------------------------------------------------------------
# 条目字段抽取
# --------------------------------------------------------------------------
RE_SIGN = re.compile(r"（(署名[^）]*|与[^）]*合作|与[^）]*先生合作)）")
RE_JOURNAL = re.compile(r"《([^《》]+)》")
RE_ISSUE = re.compile(r"(\d{4})年第(\d+)期")
RE_PAGES = re.compile(r"第([\d０-９]+[—\-－~～][\d０-９]+|[\d０-９]+)\s*页")
RE_PRESS_DATE = re.compile(r"(\d{4})年(\d{1,2})月(\d{1,2})日")
RE_PUB_YEAR = re.compile(r"(\d{4})年(\d{1,2})?月?")
RE_PUBLISHER = re.compile(
    r"([\u4e00-\u9fa5·]{2,12}?(?:出版社|书局|书店|印书馆|印书馆有限公司|出版有限公司|有限公司|书社|文献出版社|古籍出版社))"
)
RE_EDITION = re.compile(r"^《(.+?)》(（([^）]+)）)?")


def parse_signature(text: str):
    """署名 / 合作情况。"""
    m = RE_SIGN.search(text)
    if not m:
        return None
    s = m.group(1)
    if s.startswith("署名"):
        return {"type": "pseudonym", "text": s.replace("署名", "")}
    return {"type": "coauthor", "text": s.replace("与", "").replace("合作", "")}


def parse_paper(raw: str):
    """论文 / 序跋 / 随笔等：题名 + 出处信息。"""
    item = {"raw": raw, "titleMark": "《"}
    m = RE_ITEM.match(raw)
    if m:
        item["title"] = m.group(1)
        rest = m.group(2)
    else:
        # 不以书名号开头的条目，如「2011年起，主编“中国古代文体学研究丛书”（与彭玉平合编），北京大学出版社」
        # 题名统一用书名号呈现（「2 主编」除外，向下兼容）
        m2 = re.match(r'^(.*?)[“"]([^“”"]+)[”"](.*)$', raw)
        if m2:
            item["prefix"] = m2.group(1).strip()
            item["title"] = m2.group(2)
            item["titleMark"] = "《"
            rest = m2.group(3)
        else:
            m3 = re.match(r'^(.*?)《(.+?)》(.*)$', raw)
            if m3:
                item["prefix"] = m3.group(1).strip()
                item["title"] = m3.group(2)
                rest = m3.group(3)
            else:
                item["titleMark"] = ""
                item["title"] = raw.rstrip("。")
                rest = ""
    item["signature"] = parse_signature(rest or raw)

    rest = re.sub(r"^[，,、]\s*", "", rest.strip()).rstrip("。")

    # 刊物 / 报纸 / 文集
    jm = RE_JOURNAL.search(rest)
    issue = RE_ISSUE.search(rest)
    pdate = RE_PRESS_DATE.search(rest)
    pages = RE_PAGES.search(rest)

    if issue:
        item["venue"] = jm.group(1) if jm else ""
        item["issue"] = issue.group(1) + "年第" + issue.group(2) + "期"
        item["kind"] = "journal"
    elif pdate:
        # 报纸日期：往前取《》里的报刊名
        item["venue"] = jm.group(1) if jm else ""
        item["issue"] = "%s年%s月%s日" % (pdate.group(1), pdate.group(2), pdate.group(3))
        item["kind"] = "newspaper"
    elif "收入" in rest or "载" in rest or "主编" in rest:
        item["venue"] = jm.group(1) if jm else ""
        item["issue"] = ""
        item["kind"] = "anthology"
    else:
        item["venue"] = jm.group(1) if jm else ""
        item["issue"] = ""
        item["kind"] = "other"

    if pages:
        item["pages"] = pages.group(1)
    item["rest"] = rest
    return item


def parse_monograph(raw: str):
    """著作：书名 + 版次 + 出版社 + 年月。"""
    item = {"raw": raw}
    m = RE_EDITION.match(raw)
    item["title"] = m.group(1) if m else raw
    item["edition"] = (m.group(3) or "").strip() if m else ""
    body = raw[m.end():] if m else raw
    body = re.sub(r"^[，,]\s*", "", body.strip())

    years = RE_PUB_YEAR.findall(body)
    item["year"] = years[-1][0] if years else ""
    pm = RE_PUBLISHER.search(body)
    if pm:
        item["publisher"] = pm.group(1)
    else:
        # 形如「三聯書店（香港）有限公司」等非常规名
        pm2 = re.search(r"^([^，,0-9]+?)(?=\d{4}年)", body)
        item["publisher"] = pm2.group(1).strip() if pm2 else body
    if "合作" in raw or "与" in raw:
        item["coauthor"] = True
    item["body"] = body
    return item


def parse_award(raw: str):
    """获奖：年份 + 事项。"""
    m = re.match(r"^(\d{4})年[，,]?(.*)$", raw)
    return {
        "raw": raw,
        "year": m.group(1) if m else "",
        "text": (m.group(2) if m else raw).rstrip("。"),
    }


# --------------------------------------------------------------------------
# 主解析：状态机
# --------------------------------------------------------------------------
def parse(lines):
    body = lines[1:] if lines and not lines[0].startswith("【") else lines

    data = {
        "meta": {
            "person": "吴承学",
            "title": "吴承学教授著述表",
            "generated": datetime.date.today().isoformat(),
            "source": DOCX.name,
            "asOf": "",
        },
        "profile": [],
        "courses": [],
        "literature": [],   # 【著述情况】
        "awards": [],       # 【获奖情况】
    }

    section = None          # 顶层：【基本信息】…
    group = None            # 二级：一、研究成果
    sub = None              # 三级：（一）著作
    year = None             # 论文年份

    def current_list():
        """返回当前应写入的条目容器。"""
        if section == "profile":
            return data["profile"]
        if section == "courses":
            return data["courses"]
        if section == "literature":
            return data["literature"]
        if section == "awards":
            return data["awards"]
        return None

    for raw in body:
        m1 = RE_H1.match(raw)
        if m1:
            name = m1.group(1)
            section = {"基本信息": "profile", "开设课程": "courses",
                       "著述情况": "literature", "获奖情况": "awards"}.get(name, name)
            if section == "literature":
                data["literature"] = {"title": name, "groups": []}
            elif section == "awards":
                data["awards"] = {"title": name, "groups": []}
            elif section == "courses":
                data["courses"] = {"title": name, "groups": []}
            group = sub = year = None
            continue

        # 截至日期
        m_asof = re.match(r"^（统计截至(.+?)）$", raw)
        if m_asof:
            data["meta"]["asOf"] = m_asof.group(1)
            continue

        m2 = RE_H2.match(raw)
        if m2 and section in ("literature", "awards"):
            container = data[section]
            group = {"title": m2.group(2), "items": [], "years": [], "subs": []}
            container["groups"].append(group)
            sub = year = None
            continue

        m3 = RE_H3.match(raw)
        if m3 and group is not None:
            sub = {"title": m3.group(2), "items": [], "years": []}
            group["subs"].append(sub)
            year = None
            continue

        m4 = RE_YEAR.match(raw)
        if m4 and sub is not None:
            year = {"year": m4.group(1), "items": []}
            sub["years"].append(year)
            continue

        target = None
        if sub is not None:
            target = year if year is not None else sub
        elif group is not None:
            target = group
        elif section == "profile":
            data["profile"].append(raw)
            continue
        elif section == "courses":
            continue

        if target is None:
            continue

        # 课程：一、研究生课程 / 二、本科生课程
        if section == "courses":
            continue

        # 组内无书名号的小标题（如「访谈」），保留为分组标签
        if (target is not None and not raw.startswith("《")
                and len(raw) <= 10 and not re.search(r"[。，；：]$", raw)):
            target["items"].append({"raw": raw, "label": raw})
            continue

        if section == "awards":
            target["items"].append(parse_award(raw))
        elif sub is not None and "著作" in (sub["title"] or ""):
            target["items"].append(parse_monograph(raw))
        else:
            target["items"].append(parse_paper(raw))

    # ---- 课程单独解析（编号条目 + 组名） ----
    data["courses"] = parse_courses(body)

    # ---- 统计 ----
    monographs, papers, others = 0, 0, 0
    years = []
    for g in data["literature"].get("groups", []):
        for y in g.get("years", []):
            papers += len(y["items"])
            years.append(y["year"])
        for s in g.get("subs", []):
            if "著作" in s["title"]:
                monographs += len(s["items"])
            else:
                for y in s.get("years", []):
                    papers += len(y["items"])
                    years.append(y["year"])
                if not s.get("years"):
                    others += len(s["items"])
    data["stats"] = {
        "monographs": monographs,
        "papers": papers,
        "paperYears": len(set(years)),
        "yearRange": (min(years) + "–" + max(years)) if years else "",
    }
    return data


def parse_courses(lines):
    """单独解析【开设课程】，返回 {groups:[{title, items:[...]}]}。"""
    groups = []
    inside = False
    for raw in lines:
        if raw.startswith("【"):
            inside = raw == "【开设课程】"
            continue
        if not inside:
            continue
        m2 = RE_H2.match(raw)
        if m2:
            groups.append({"title": m2.group(2), "items": []})
            continue
        mn = RE_NUM_ITEM.match(raw)
        if mn and groups:
            groups[-1]["items"].append(mn.group(2))
        elif groups and not raw.startswith("【"):
            # 可能是未编号的课程名
            if len(raw) < 40:
                groups[-1]["items"].append(raw)
    return {"groups": groups}


def main():
    if not DOCX.exists():
        print("找不到 docx：%s" % DOCX, file=sys.stderr)
        return 1
    lines = read_paragraphs(DOCX)
    data = parse(lines)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    st = data["stats"]
    print("段落：%d → %s" % (len(lines), OUT.relative_to(ROOT)))
    print("著作：%d 部" % st["monographs"])
    print("论文：%d 篇（%d 个年份，%s）" % (st["papers"], st["paperYears"], st["yearRange"]))
    print("课程组：%s" % "、".join(
        "%s %d 门" % (g["title"], len(g["items"])) for g in data["courses"]["groups"]))
    print("著述板块：")
    for g in data["literature"].get("groups", []):
        subs = ["%s(%d)" % (s["title"], sum(len(y["items"]) for y in s["years"]) or len(s["items"]))
                for s in g.get("subs", [])]
        direct = sum(len(y["items"]) for y in g.get("years", []))
        print("  · %s → 直属 %d 条，子组 %s" % (g["title"], direct, "、".join(subs) or "无"))
    print("获奖板块：")
    for g in data["awards"].get("groups", []):
        subs = ["%s(%d)" % (s["title"], len(s["items"])) for s in g.get("subs", [])]
        direct = len(g.get("items", [])) + sum(len(y["items"]) for y in g.get("years", []))
        print("  · %s → 直属 %d 条，子组 %s" % (g["title"], direct, "、".join(subs) or "无"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
