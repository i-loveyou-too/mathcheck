from __future__ import annotations


SUBJECT_LABELS = {
    "math1": "수학Ⅰ",
    "math2": "수학Ⅱ",
    "probability": "확률과 통계",
}


DAY_TOPICS = {
    1: [
        ("math1", "지수와 로그", [
            "거듭제곱과 지수의 기본 의미",
            "a^0",
            "a^(-n)",
            "지수법칙 - 곱",
            "지수법칙 - 몫",
            "지수법칙 - 거듭제곱의 거듭제곱",
            "거듭제곱근의 뜻",
            "n제곱근의 실수 개수와 n의 parity / a의 부호 관계",
            "거듭제곱근의 곱셈 성질",
            "거듭제곱근의 나눗셈 성질",
            "분수지수와 근호의 관계",
            "로그의 정의",
            "로그가 정의되기 위한 밑 조건",
            "로그가 정의되기 위한 진수 조건",
            "log_a 1",
            "log_a a",
            "로그의 곱셈 성질",
            "로그의 나눗셈 성질",
            "로그의 거듭제곱 성질",
            "밑의 변환 공식",
            "log_a b와 log_b a의 관계",
            "상용로그의 뜻",
            "상용로그 기본값",
            "지수식과 로그식의 상호 변환",
        ]),
        ("math1", "지수함수와 로그함수", [
            "지수함수 y=a^x의 정의 조건",
            "a>1일 때 지수함수 증가",
            "0<a<1일 때 지수함수 감소",
            "지수함수의 y절편",
            "지수함수의 점근선",
            "로그함수 y=log_a x의 정의역",
            "로그함수의 점근선",
            "a>1일 때 로그함수 증가",
            "0<a<1일 때 로그함수 감소",
            "지수함수와 로그함수의 역함수 관계",
            "두 그래프의 y=x 대칭",
            "지수방정식에서 밑을 같게 만드는 기본 전략",
            "지수부등식에서 a>1일 때 부등호 방향",
            "지수부등식에서 0<a<1일 때 부등호 방향",
            "로그방정식에서 진수조건 확인",
            "로그부등식에서 a>1일 때 부등호 방향",
            "로그부등식에서 0<a<1일 때 부등호 방향",
            "로그부등식에서 진수조건 확인",
            "지수·로그함수 그래프의 평행이동",
            "지수·로그함수 최댓값·최솟값 문제의 함수 활용",
        ]),
        ("math1", "삼각함수", [
            "일반각의 뜻",
            "시초선과 동경",
            "360도 n + theta 형태",
            "호도법",
            "180도 = pi rad 관계",
            "호의 길이 공식",
            "부채꼴 넓이 공식",
            "sin theta의 정의",
            "cos theta의 정의",
            "tan theta의 정의",
            "tan theta = sin theta / cos theta",
            "sin^2 theta + cos^2 theta = 1",
            "사분면에 따른 sin 부호",
            "사분면에 따른 cos 부호",
            "사분면에 따른 tan 부호",
            "sin 그래프 기본 개형",
            "cos 그래프 기본 개형",
            "tan 그래프 기본 개형",
            "sin, cos의 주기",
            "tan의 주기",
            "sin(-theta), cos(-theta), tan(-theta)",
            "pi - theta 관련 각공식",
            "pi + theta 관련 각공식",
            "2pi - theta 관련 각공식",
            "pi/2 ± theta 관련 각공식",
            "y=a sin x, y=a cos x에서 진폭",
            "y=sin bx, cos bx에서 주기 변화",
            "y=tan bx에서 주기 변화",
            "그래프 평행이동 기본형",
        ]),
        ("math2", "함수의 극한", [
            "함수의 극한의 뜻",
            "좌극한",
            "우극한",
            "극한 존재 조건 = 좌극한과 우극한의 일치",
            "함숫값과 극한값은 다를 수 있음",
            "상수배의 극한",
            "합의 극한",
            "차의 극한",
            "곱의 극한",
            "몫의 극한과 분모 조건",
            "0/0 유리식의 인수분해/약분",
            "0/0 무리식의 유리화",
            "무한대/무한대 꼴 기본 처리",
            "최고차항으로 나누는 방법",
            "함수 극한의 대소관계",
            "샌드위치 정리 형태",
        ]),
        ("math2", "함수의 연속", [
            "x=a에서 연속의 정의",
            "lim f(x)=f(a)",
            "좌연속과 우연속 개념",
            "구간에서의 연속",
            "연속함수의 합",
            "연속함수의 차",
            "연속함수의 곱",
            "연속함수의 몫과 분모 조건",
            "닫힌구간 연속과 최대·최소 정리",
            "사잇값정리",
            "방정식의 실근 존재를 사잇값정리로 확인하는 구조",
        ]),
        ("probability", "여러 가지 순열", [
            "곱의 법칙",
            "합의 법칙",
            "순열의 뜻",
            "nPr 공식",
            "nPn = n!",
            "중복순열의 뜻",
            "중복순열 n^r",
            "함수의 개수와 중복순열의 관계",
            "일대일함수의 개수",
            "원순열의 뜻",
            "원순열 (n-1)!",
            "회전하여 같은 배열 처리",
            "같은 것이 있는 순열 공식",
            "같은 것이 있는 순열에서 전체 개수 / 중복 factorial 구조",
            "조건이 있는 배열에서 묶어 세는 기본 전략",
            "사건을 이용해 배열 개수 세기",
        ]),
        ("probability", "중복조합과 이항정리", [
            "중복조합의 뜻",
            "nHr 공식",
            "nHr = n+r-1Cr",
            "음이 아닌 정수해와 중복조합 관계",
            "자연수해 문제에서 변수 치환",
            "항의 개수와 중복조합 관계",
            "이항정리",
            "이항정리 일반항",
            "특정 항의 계수 찾기",
            "이항계수",
            "nC0+...+nCn=2^n",
            "짝수항과 홀수항 이항계수 합",
            "교대합",
            "파스칼의 삼각형 관계",
            "nCr=nC(n-r)",
        ]),
    ],
    2: [
        ("math1", "사인법칙과 코사인법칙", [
            "사인법칙",
            "a/sinA = b/sinB = c/sinC = 2R",
            "외접원 반지름과 사인법칙",
            "코사인법칙 각 변형 공식",
            "cosA 형태로 정리",
            "세 변으로 각 구하기",
            "두 변과 끼인각으로 나머지 변 구하기",
            "삼각형 넓이 1/2bc sinA",
            "변/각 조건을 보고 사인법칙 vs 코사인법칙 선택",
            "삼각형 둔각 조건과 삼각함수 값 해석",
        ]),
        ("math2", "미분계수와 도함수", [
            "평균변화율",
            "미분계수 정의",
            "좌미분계수와 우미분계수",
            "미분가능 조건",
            "미분가능이면 연속",
            "연속이어도 미분가능은 아님",
            "접선 기울기 의미",
            "도함수의 정의",
            "상수 미분",
            "x^n 미분",
            "상수배 미분",
            "합과 차의 미분",
            "곱의 미분",
            "미분계수 정의의 변형 인식",
        ]),
        ("math2", "도함수의 활용 1", [
            "접선 방정식",
            "접점에서의 접선",
            "외부의 한 점을 지나는 접선 기본 구조",
            "평균값정리 조건",
            "평균값정리의 뜻",
            "f'>0이면 증가",
            "f'<0이면 감소",
            "도함수 부호표",
            "증가/감소 구간",
        ]),
        ("math2", "도함수의 활용 2", [
            "극대와 극소 정의",
            "극값의 필요조건 f'=0",
            "f'=0은 극값의 충분조건이 아님",
            "+에서 -로 바뀌면 극대",
            "-에서 +로 바뀌면 극소",
            "최대/최소와 극대/극소 차이",
            "닫힌구간 최대/최소에서 끝점 확인",
            "함수 그래프 개형",
            "방정식 실근 수와 그래프 교점",
            "매개변수에 따른 실근 개수",
            "부등식과 그래프 위아래 관계",
            "속도/가속도와 도함수 관계",
        ]),
        ("probability", "확률의 뜻과 활용", [
            "시행",
            "표본공간",
            "사건",
            "근원사건",
            "수학적 확률",
            "확률 기본성질",
            "공사건",
            "전체사건",
            "합사건",
            "교사건",
            "배반사건",
            "확률 덧셈정리",
            "여사건",
            "적어도 하나와 여사건 활용",
        ]),
        ("probability", "조건부확률", [
            "조건부확률의 뜻",
            "P(B|A)",
            "조건부확률 공식",
            "곱셈정리",
            "전체확률 형태",
            "독립의 뜻",
            "독립 조건",
            "독립과 배반 차이",
            "여사건과 독립 관계",
            "독립시행",
            "이항 독립시행 확률",
            "정확히 r번",
            "적어도 r번",
            "몇 번 이상",
        ]),
    ],
    3: [
        ("math1", "등차수열과 등비수열", [
            "수열의 항",
            "일반항",
            "등차수열 정의",
            "공차",
            "등차 일반항",
            "등차중항",
            "등차수열 합",
            "항의 개수 × 양끝 평균",
            "등비수열 정의",
            "공비",
            "등비 일반항",
            "등비중항",
            "등비수열 합",
            "r=1 예외",
        ]),
        ("math1", "수열의 합과 수학적 귀납법", [
            "Sigma 의미",
            "Sigma 상수배",
            "Sigma 합과 차",
            "Sigma 1",
            "Sigma k",
            "Sigma k^2",
            "Sigma k^3",
            "부분분수형 합",
            "소거형 합",
            "Sn과 an 관계",
            "n=1 별도 처리",
            "귀납적으로 정의된 수열",
            "수학적 귀납법 1단계",
            "귀납 가정",
            "k+1 증명",
        ]),
        ("math2", "부정적분과 정적분", [
            "원시함수",
            "부정적분",
            "적분상수",
            "x^n 적분",
            "상수배 적분",
            "합과 차의 적분",
            "정적분 정의와 기본 계산",
            "적분구간이 같으면 0",
            "구간 뒤집기의 부호",
            "구간 분할",
            "미분과 적분의 관계",
            "기함수의 정적분",
            "우함수의 정적분",
        ]),
        ("math2", "정적분의 활용", [
            "정적분값과 넓이 차이",
            "x축 위아래 부호",
            "곡선과 x축 사이 넓이",
            "두 곡선 사이 넓이",
            "위 함수 - 아래 함수",
            "교점에서 구간 분할",
            "위치/속도/가속도",
            "속도 적분과 위치 변화량",
            "|속도| 적분과 이동거리",
            "속도=0에서 방향 변화 확인",
        ]),
        ("probability", "이산확률변수와 이항분포", [
            "확률변수",
            "이산확률변수",
            "확률분포",
            "확률질량함수",
            "확률의 합 1",
            "평균 E(X)",
            "E(X^2)",
            "분산",
            "V=E(X^2)-E(X)^2",
            "표준편차",
            "E(aX+b)",
            "V(aX+b)",
            "sigma(aX+b)",
            "이항분포 B(n,p)",
            "이항분포 확률",
            "평균 np",
            "분산 npq",
            "표준편차 sqrt(npq)",
        ]),
        ("probability", "연속확률변수와 정규분포", [
            "연속확률변수",
            "확률밀도함수",
            "f(x)>=0",
            "전체 넓이=1",
            "구간확률=넓이",
            "한 점의 확률=0",
            "정규분포 N(m,sigma^2)",
            "평균을 중심으로 대칭",
            "표준편차와 퍼짐",
            "표준정규분포",
            "표준화 Z=(X-m)/sigma",
            "표준정규분포표 사용",
            "이항분포의 정규근사",
        ]),
        ("probability", "통계적 추정", [
            "모집단",
            "표본",
            "모평균",
            "모분산",
            "모표준편차",
            "표본평균",
            "표본평균의 확률변수",
            "E(Xbar)=m",
            "V(Xbar)=sigma^2/n",
            "sigma(Xbar)=sigma/sqrt(n)",
            "표본 크기와 표준오차",
            "모평균 추정",
            "신뢰도",
            "95% 신뢰구간",
            "99% 신뢰구간",
            "신뢰도가 높아지면 구간 폭 증가",
            "표본 수가 커지면 구간 폭 감소",
        ]),
    ],
}


# Student-facing display text for topics whose raw label mixes English math
# notation (e.g. "a^0", "theta", "parity") into a plain string. The keys below
# are matched against the *original* DAY_TOPICS strings so that concept codes,
# chapter grouping, and formula lookups (which key off the raw topic text)
# stay untouched. Only what the student actually reads is rewritten here:
# variables/expressions get LaTeX `$...$` delimiters, English math jargon is
# translated to Korean (parity -> 홀짝), and "/" used as an ad-hoc math
# separator is replaced with a real LaTeX fraction or a Korean list dot "·".
TOPIC_DISPLAY_OVERRIDES: dict[str, str] = {
    "a^0": "$a^0$",
    "a^(-n)": "$a^{-n}$",
    "n제곱근의 실수 개수와 n의 parity / a의 부호 관계": "$x^n=a$의 실근 개수와 $n$의 홀짝, $a$의 부호 관계",
    "log_a 1": "$\\log_a 1$",
    "지수함수 y=a^x의 정의 조건": "지수함수 $y=a^x$의 정의 조건",
    "a>1일 때 지수함수 증가": "$a>1$일 때 지수함수 증가",
    "0<a<1일 때 지수함수 감소": "$0<a<1$일 때 지수함수 감소",
    "로그함수 y=log_a x의 정의역": "로그함수 $y=\\log_a x$의 정의역",
    "a>1일 때 로그함수 증가": "$a>1$일 때 로그함수 증가",
    "0<a<1일 때 로그함수 감소": "$0<a<1$일 때 로그함수 감소",
    "두 그래프의 y=x 대칭": "두 그래프의 $y=x$ 대칭",
    "지수부등식에서 a>1일 때 부등호 방향": "지수부등식에서 $a>1$일 때 부등호 방향",
    "지수부등식에서 0<a<1일 때 부등호 방향": "지수부등식에서 $0<a<1$일 때 부등호 방향",
    "로그부등식에서 a>1일 때 부등호 방향": "로그부등식에서 $a>1$일 때 부등호 방향",
    "로그부등식에서 0<a<1일 때 부등호 방향": "로그부등식에서 $0<a<1$일 때 부등호 방향",
    "360도 n + theta 형태": "$360^\\circ n+\\theta$ 형태",
    "180도 = pi rad 관계": "$180^\\circ=\\pi\\,\\text{rad}$ 관계",
    "sin theta의 정의": "$\\sin\\theta$의 정의",
    "cos theta의 정의": "$\\cos\\theta$의 정의",
    "tan theta의 정의": "$\\tan\\theta$의 정의",
    "tan theta = sin theta / cos theta": "$\\tan\\theta=\\dfrac{\\sin\\theta}{\\cos\\theta}$",
    "sin^2 theta + cos^2 theta = 1": "$\\sin^2\\theta+\\cos^2\\theta=1$",
    "sin(-theta), cos(-theta), tan(-theta)": "$\\sin(-\\theta)$, $\\cos(-\\theta)$, $\\tan(-\\theta)$",
    "pi - theta 관련 각공식": "$\\pi-\\theta$ 관련 각공식",
    "pi + theta 관련 각공식": "$\\pi+\\theta$ 관련 각공식",
    "2pi - theta 관련 각공식": "$2\\pi-\\theta$ 관련 각공식",
    "pi/2 ± theta 관련 각공식": "$\\dfrac{\\pi}{2}\\pm\\theta$ 관련 각공식",
    "y=a sin x, y=a cos x에서 진폭": "$y=a\\sin x$, $y=a\\cos x$에서 진폭",
    "y=sin bx, cos bx에서 주기 변화": "$y=\\sin bx$, $y=\\cos bx$에서 주기 변화",
    "y=tan bx에서 주기 변화": "$y=\\tan bx$에서 주기 변화",
    "극한 존재 조건 = 좌극한과 우극한의 일치": "극한 존재 조건: 좌극한과 우극한의 일치",
    "0/0 유리식의 인수분해/약분": "$\\dfrac{0}{0}$ 꼴 유리식의 인수분해·약분",
    "0/0 무리식의 유리화": "$\\dfrac{0}{0}$ 꼴 무리식의 유리화",
    "무한대/무한대 꼴 기본 처리": "$\\dfrac{\\infty}{\\infty}$ 꼴 기본 처리",
    "x=a에서 연속의 정의": "$x=a$에서 연속의 정의",
    "lim f(x)=f(a)": "$\\lim f(x)=f(a)$",
    "nPr 공식": "${}_nP_r$ 공식",
    "nPn = n!": "${}_nP_n=n!$",
    "중복순열 n^r": "중복순열 $n^r$",
    "원순열 (n-1)!": "원순열 $(n-1)!$",
    "같은 것이 있는 순열에서 전체 개수 / 중복 factorial 구조": "같은 것이 있는 순열에서 전체 개수를 중복된 것의 계승($!$)으로 나누는 구조",
    "nHr 공식": "${}_nH_r$ 공식",
    "nHr = n+r-1Cr": "${}_nH_r={}_{n+r-1}C_r$",
    "nC0+...+nCn=2^n": "${}_nC_0+\\cdots+{}_nC_n=2^n$",
    "nCr=nC(n-r)": "${}_nC_r={}_nC_{n-r}$",
    "a/sinA = b/sinB = c/sinC = 2R": "$\\dfrac{a}{\\sin A}=\\dfrac{b}{\\sin B}=\\dfrac{c}{\\sin C}=2R$",
    "삼각형 넓이 1/2bc sinA": "삼각형 넓이 $\\dfrac12 bc\\sin A$",
    "변/각 조건을 보고 사인법칙 vs 코사인법칙 선택": "변·각 조건을 보고 사인법칙과 코사인법칙 중 선택",
    "x^n 미분": "$x^n$ 미분",
    "f'>0이면 증가": "$f'>0$이면 증가",
    "f'<0이면 감소": "$f'<0$이면 감소",
    "증가/감소 구간": "증가·감소 구간",
    "극값의 필요조건 f'=0": "극값의 필요조건 $f'=0$",
    "f'=0은 극값의 충분조건이 아님": "$f'=0$은 극값의 충분조건이 아님",
    "최대/최소와 극대/극소 차이": "최대·최소와 극대·극소 차이",
    "닫힌구간 최대/최소에서 끝점 확인": "닫힌구간 최대·최소에서 끝점 확인",
    "속도/가속도와 도함수 관계": "속도·가속도와 도함수 관계",
    "r=1 예외": "$r=1$ 예외",
    "Sigma 의미": "$\\Sigma$ 의미",
    "Sigma 상수배": "$\\Sigma$ 상수배",
    "Sigma 합과 차": "$\\Sigma$ 합과 차",
    "Sigma 1": "$\\Sigma 1$",
    "Sigma k": "$\\Sigma k$",
    "Sigma k^2": "$\\Sigma k^2$",
    "Sigma k^3": "$\\Sigma k^3$",
    "n=1 별도 처리": "$n=1$ 별도 처리",
    "k+1 증명": "$k+1$ 증명",
    "x^n 적분": "$x^n$ 적분",
    "적분구간이 같으면 0": "적분구간이 같으면 $0$",
    "위치/속도/가속도": "위치·속도·가속도",
    "속도=0에서 방향 변화 확인": "속도가 $0$일 때 방향 변화 확인",
    "확률의 합 1": "확률의 합 $1$",
    "E(X^2)": "$E(X^2)$",
    "V=E(X^2)-E(X)^2": "$V=E(X^2)-\\{E(X)\\}^2$",
    "sigma(aX+b)": "$\\sigma(aX+b)$",
    "표준편차 sqrt(npq)": "표준편차 $\\sqrt{npq}$",
    "f(x)>=0": "$f(x)\\ge0$",
    "전체 넓이=1": "전체 넓이 $=1$",
    "구간확률=넓이": "구간확률은 넓이와 같음",
    "한 점의 확률=0": "한 점의 확률 $=0$",
    "정규분포 N(m,sigma^2)": "정규분포 $N(m,\\sigma^2)$",
    "표준화 Z=(X-m)/sigma": "표준화 $Z=\\dfrac{X-m}{\\sigma}$",
    "E(Xbar)=m": "$E(\\overline{X})=m$",
    "V(Xbar)=sigma^2/n": "$V(\\overline{X})=\\dfrac{\\sigma^2}{n}$",
    "sigma(Xbar)=sigma/sqrt(n)": "$\\sigma(\\overline{X})=\\dfrac{\\sigma}{\\sqrt{n}}$",
}


def display_title(topic: str) -> str:
    """Student-facing rendering of a topic label (see TOPIC_DISPLAY_OVERRIDES)."""
    display = TOPIC_DISPLAY_OVERRIDES.get(topic, topic)
    return display.replace("parity", "홀짝")


def concept_code(day: int, subject: str, chapter_index: int, topic_index: int, topic: str) -> str:
    slug = "".join(char.lower() if char.isalnum() else "_" for char in topic)
    slug = "_".join(part for part in slug.split("_") if part)
    return f"d{day}_{subject}_{chapter_index}_{topic_index}_{slug[:36]}"


def build_card(subject: str, chapter: str, topic: str) -> dict:
    display = display_title(topic)
    return {
        "title": display,
        "formula": formula_for_topic(topic),
        "explanation": f"{SUBJECT_LABELS.get(subject, subject)} {chapter}에서 '{display}'은 문제를 풀기 전에 먼저 떠올려야 하는 기본 개념입니다. 정의, 조건, 예외를 함께 확인해야 계산 실수를 줄일 수 있습니다.",
        "application": f"문제에서 {chapter} 단서가 보이면 '{display}'을 적용할 수 있는 상황인지 먼저 판단하고, 필요한 조건을 만족하는지 확인합니다.",
        "caution": caution_for_topic(topic),
    }


def formula_for_topic(topic: str) -> str | None:
    rules = [
        ("a^0", "$a^0=1\\ (a\\neq0)$"),
        ("a^(-n)", "$a^{-n}=\\dfrac{1}{a^n}\\ (a\\neq0)$"),
        ("곱", "$a^m a^n=a^{m+n}$"),
        ("몫", "$\\dfrac{a^m}{a^n}=a^{m-n}$"),
        ("거듭제곱의 거듭제곱", "$(a^m)^n=a^{mn}$"),
        ("log_a 1", "$\\log_a 1=0$"),
        ("log_a a", "$\\log_a a=1$"),
        ("밑의 변환", "$\\log_a b=\\dfrac{\\log_c b}{\\log_c a}$"),
        ("tan theta", "$\\tan\\theta=\\dfrac{\\sin\\theta}{\\cos\\theta}$"),
        ("sin^2", "$\\sin^2\\theta+\\cos^2\\theta=1$"),
        ("호의 길이", "$l=r\\theta$"),
        ("부채꼴", "$S=\\dfrac12 r^2\\theta$"),
        ("nPr", "${}_nP_r=\\dfrac{n!}{(n-r)!}$"),
        ("nPn", "${}_nP_n=n!$"),
        ("중복순열", "$n^r$"),
        ("원순열", "$(n-1)!$"),
        ("nHr", "${}_nH_r={}_{n+r-1}C_r$"),
        ("사인법칙", "$\\dfrac{a}{\\sin A}=\\dfrac{b}{\\sin B}=\\dfrac{c}{\\sin C}=2R$"),
        ("코사인법칙", "$a^2=b^2+c^2-2bc\\cos A$"),
        ("삼각형 넓이", "$S=\\dfrac12 bc\\sin A$"),
        ("x^n 미분", "$(x^n)'=nx^{n-1}$"),
        ("x^n 적분", "$\\displaystyle\\int x^n\\,dx=\\dfrac{x^{n+1}}{n+1}+C\\ (n\\neq-1)$"),
        ("E(aX+b)", "$E(aX+b)=aE(X)+b$"),
        ("V(aX+b)", "$V(aX+b)=a^2V(X)$"),
        ("이항분포", "$P(X=r)={}_nC_r\\,p^r q^{n-r}$"),
        ("평균 np", "$E(X)=np$"),
        ("분산 npq", "$V(X)=npq$"),
        ("표준화", "$Z=\\dfrac{X-m}{\\sigma}$"),
    ]
    for key, formula in rules:
        if key in topic:
            return formula
    return None


def caution_for_topic(topic: str) -> str:
    if "조건" in topic or "정의" in topic:
        return "정의가 성립하는 조건을 빠뜨리면 답이 맞아 보여도 풀이가 틀릴 수 있습니다."
    if "부등식" in topic:
        return "밑의 범위에 따라 부등호 방향이 바뀌는지 반드시 확인합니다."
    if "극한" in topic:
        return "함숫값과 극한값을 같은 것으로 놓지 않도록 구분합니다."
    if "연속" in topic:
        return "극한값 존재, 함숫값 존재, 두 값의 일치가 모두 필요합니다."
    if "최대" in topic or "최소" in topic:
        return "닫힌구간에서는 내부의 극값뿐 아니라 양 끝점의 값도 확인합니다."
    if "확률" in topic or "사건" in topic:
        return "전체 경우의 수와 조건이 바뀐 표본공간을 혼동하지 않습니다."
    return "공식만 외우지 말고, 언제 쓸 수 없는지도 함께 확인합니다."


def question_stem(display: str) -> tuple[str, str]:
    """Split a topic display string into (quoted stem, meaning-word) so the
    generated question never doubles up a meaning word the topic already
    ends with (e.g. "중복조합의 뜻" -> would otherwise produce "'중복조합의 뜻'의 뜻").
    """
    if display.endswith("의 뜻"):
        return display[: -len("의 뜻")], "뜻"
    if display.endswith("의 정의"):
        return display[: -len("의 정의")], "정의"
    if display.endswith("정의"):
        return display[: -len("정의")].rstrip(), "정의"
    return display, "뜻"


def prompt_for(subject: str, chapter: str, topic: str) -> str:
    stem, meaning_word = question_stem(display_title(topic))
    return f"{SUBJECT_LABELS.get(subject, subject)} · {chapter}에서 '{stem}'의 {meaning_word}, 적용 조건, 대표 공식이나 판단 기준을 설명할 수 있나요?"


def build_concepts() -> list[dict]:
    concepts: list[dict] = []
    for day, chapters in DAY_TOPICS.items():
        order = 1
        for chapter_index, (subject, chapter, topics) in enumerate(chapters, start=1):
            for topic_index, topic in enumerate(topics, start=1):
                concepts.append({
                    "code": concept_code(day, subject, chapter_index, topic_index, topic),
                    "day": day,
                    "subject": subject,
                    "subject_label": SUBJECT_LABELS.get(subject, subject),
                    "chapter": chapter,
                    "chapter_order": chapter_index,
                    "order": order,
                    "prompt": prompt_for(subject, chapter, topic),
                    "card": build_card(subject, chapter, topic),
                })
                order += 1
    return concepts


SUTEUK_CONCEPT_ITEMS = build_concepts()
