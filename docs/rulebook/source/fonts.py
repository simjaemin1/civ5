"""규칙서 글꼴 준비: Noto Sans KR / Noto Serif KR 가변 글꼴을 받아 굵기별 정적 글꼴로 만든다 (PDF에 TrueType으로 들어가게).
사용: pip install fonttools && python3 fonts.py
"""
import os
import urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

here = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fonts')
os.makedirs(here, exist_ok=True)
base = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'
jobs = [('notosanskr/NotoSansKR%5Bwght%5D.ttf', 'NSans', [400, 700, 800, 900]), ('notoserifkr/NotoSerifKR%5Bwght%5D.ttf', 'NSerif', [400, 700])]
for url, fam, weights in jobs:
    src = os.path.join(here, fam + '-var.ttf')
    if not os.path.exists(src):
        urllib.request.urlretrieve(base + url, src)
    for w in weights:
        out = os.path.join(here, f'{fam}-{w}.ttf')
        if not os.path.exists(out):
            instantiateVariableFont(TTFont(src), {'wght': w}, updateFontNames=False).save(out)
            print(out)
