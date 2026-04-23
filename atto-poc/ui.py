"""
Atto POC — LiteLLM Local Demo UI
Run with: uv run streamlit run ui.py
"""

import time
import httpx
import streamlit as st

API_BASE = "http://localhost:8000"

# ---------------------------------------------------------------------------
# Model catalogue grouped by provider
# ---------------------------------------------------------------------------
PROVIDERS = {
    "Anthropic": {
        "color": "#d97706",
        "models": {
            "Claude Haiku 4.5": {
                "id": "openai/claude-haiku",
                "input_cost": 0.80,
                "output_cost": 4.00,
                "note": "Fast & cheap · Best for demos",
                "default": True,
            },
            "Claude Sonnet 4.6": {
                "id": "openai/claude-sonnet",
                "input_cost": 3.00,
                "output_cost": 15.00,
                "note": "Most capable Claude",
                "default": False,
            },
        },
    },
    "Google": {
        "color": "#2563eb",
        "models": {
            "Gemini 2.0 Flash": {
                "id": "openai/gemini-flash",
                "input_cost": 0.10,
                "output_cost": 0.40,
                "note": "Cheapest · Great quality",
                "default": False,
            },
            "Gemini 2.0 Flash Lite": {
                "id": "openai/gemini-flash-lite",
                "input_cost": 0.075,
                "output_cost": 0.30,
                "note": "Ultra cheap",
                "default": False,
            },
            "Gemini 2.5 Flash": {
                "id": "openai/gemini-2.5-flash",
                "input_cost": 0.15,
                "output_cost": 0.60,
                "note": "Balanced speed & quality",
                "default": False,
            },
            "Gemini 2.5 Pro": {
                "id": "openai/gemini-pro",
                "input_cost": 1.25,
                "output_cost": 10.00,
                "note": "Most capable Gemini",
                "default": False,
            },
        },
    },
    "OpenAI": {
        "color": "#16a34a",
        "models": {
            "GPT-4o Mini": {
                "id": "openai/gpt-4o-mini",
                "input_cost": 0.15,
                "output_cost": 0.60,
                "note": "Fast & affordable GPT",
                "default": False,
            },
            "GPT-4o": {
                "id": "openai/gpt-4o",
                "input_cost": 5.00,
                "output_cost": 15.00,
                "note": "OpenAI flagship",
                "default": False,
            },
        },
    },
}

FLAT_MODELS = {
    name: info
    for provider in PROVIDERS.values()
    for name, info in provider["models"].items()
}

EXAMPLE_PROMPTS = [
    {
        "title": "Login test (web)",
        "icon": "🔐",
        "prompt": "Generate a login test case for Gmail including happy path and invalid password scenario",
        "app_type": "web",
    },
    {
        "title": "REST API test",
        "icon": "🌐",
        "prompt": "Generate a test case for a POST /login REST API endpoint that returns a JWT token on success",
        "app_type": "api",
    },
    {
        "title": "Mobile checkout",
        "icon": "📱",
        "prompt": "Generate a checkout test case for a mobile e-commerce app covering add to cart, payment, and order confirmation",
        "app_type": "mobile",
    },
    {
        "title": "Edit existing test",
        "icon": "✏️",
        "prompt": "Add a logout step to any existing test case in the workspace",
        "app_type": "web",
    },
    {
        "title": "Forgot password",
        "icon": "🔑",
        "prompt": "Generate a forgot password flow test case for a web app",
        "app_type": "web",
    },
    {
        "title": "Search & filter",
        "icon": "🔍",
        "prompt": "Generate a test case for a product search with filters on an e-commerce web app",
        "app_type": "web",
    },
]

WORKFLOW_COLORS = {"GENERATION": "#22c55e", "EDIT": "#3b82f6", "QUESTION": "#f59e0b"}

# ---------------------------------------------------------------------------
# Page setup
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="Atto POC — LiteLLM Local Demo",
    page_icon="🤖",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
    #MainMenu { visibility: hidden; }
    footer { visibility: hidden; }

    .provider-pill {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 99px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        margin-bottom: 6px;
    }
    .section-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: #64748b;
        margin-bottom: 8px;
    }
    .arch-box {
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 8px;
        padding: 14px;
        font-family: monospace;
        font-size: 12px;
        color: #94a3b8;
        line-height: 2;
    }
    .cost-row { font-size: 13px; margin-bottom: 5px; }
</style>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Service health check (cached 10s)
# ---------------------------------------------------------------------------
@st.cache_data(ttl=10)
def check_services():
    results = {}
    try:
        httpx.get(f"{API_BASE}/workspace", timeout=2)
        results["api"] = True
    except Exception:
        results["api"] = False
    try:
        httpx.get("http://localhost:4000/health/liveliness", timeout=2)
        results["proxy"] = True
    except Exception:
        results["proxy"] = False
    return results


# ---------------------------------------------------------------------------
# SIDEBAR
# ---------------------------------------------------------------------------
with st.sidebar:
    st.markdown("## ⚙️ Mode 3 Configuration")

    # Service status
    services = check_services()
    proxy_ok = services.get("proxy", False)
    api_ok = services.get("api", False)

    col_a, col_b = st.columns(2)
    col_a.markdown(
        f"{'🟢' if proxy_ok else '🔴'} **LiteLLM**<br><small>:4000</small>",
        unsafe_allow_html=True,
    )
    col_b.markdown(
        f"{'🟢' if api_ok else '🔴'} **FastAPI**<br><small>:8000</small>",
        unsafe_allow_html=True,
    )
    if not proxy_ok:
        st.error("`docker compose up -d`", icon="🚨")
    if not api_ok:
        st.error("`uv run python main.py`", icon="🚨")

    st.divider()

    # Model picker
    st.markdown("### 🤖 Model")
    selected_model_name = None
    for provider_name, provider_data in PROVIDERS.items():
        st.markdown(
            f"<span class='provider-pill' style='background:{provider_data['color']}22;"
            f"color:{provider_data['color']};border:1px solid {provider_data['color']}55'>"
            f"{provider_name}</span>",
            unsafe_allow_html=True,
        )
        for model_name, mdata in provider_data["models"].items():
            checked = mdata["default"] and selected_model_name is None
            if st.checkbox(f"{model_name}", value=checked, key=f"model_{model_name}",
                           help=mdata["note"]):
                selected_model_name = model_name

    if selected_model_name is None:
        selected_model_name = "Claude Haiku 4.5"

    model_info = FLAT_MODELS[selected_model_name]
    st.caption(
        f"Input `${model_info['input_cost']}/1M` · Output `${model_info['output_cost']}/1M`  \n"
        f"_{model_info['note']}_"
    )

    st.divider()

    # App type
    st.markdown("### 📱 App Type")
    app_type = st.radio("", ["web", "mobile", "api"], horizontal=True,
                        label_visibility="collapsed")

    st.divider()

    # Workspace
    st.markdown("### 🗂️ Workspace")
    if st.button("🗑️ Clear all files", use_container_width=True):
        try:
            httpx.delete(f"{API_BASE}/workspace")
            st.success("Cleared.")
            st.rerun()
        except Exception as e:
            st.error(str(e))

    try:
        r = httpx.get(f"{API_BASE}/workspace", timeout=3)
        files = r.json().get("files", [])
        if files:
            for f in files:
                st.markdown(f"📄 `{f['file_name']}` · {f['size_bytes']}B")
        else:
            st.caption("No files yet.")
    except Exception:
        st.caption("_(API offline)_")

    st.divider()

    # Architecture
    st.markdown("### 🏗️ Mode 3 Flow")
    st.markdown("""
<div class='arch-box'>
UI → FastAPI :8000<br>
&nbsp;&nbsp;&nbsp;→ LiteLLM :4000<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ Anthropic / Google / OpenAI
</div>
""", unsafe_allow_html=True)
    st.caption("Mode 3: local FastAPI orchestration with a self-hosted LiteLLM proxy.")


# ---------------------------------------------------------------------------
# MAIN PANEL — Header
# ---------------------------------------------------------------------------
st.markdown("# 🤖 Atto — LiteLLM Local Demo")
st.markdown(
    "Mode 3 of the Atto proxy POC. Type a natural-language request and the local stack "
    "routes it through FastAPI and LiteLLM before generating structured **XML test cases**. "
    "Switch models freely while keeping the orchestration loop unchanged."
)

st.divider()

# ---------------------------------------------------------------------------
# Example prompt cards
# ---------------------------------------------------------------------------
st.markdown("<div class='section-label'>Quick start — pick a scenario</div>",
            unsafe_allow_html=True)

if "prefill_prompt" not in st.session_state:
    st.session_state.prefill_prompt = ""
if "prefill_app_type" not in st.session_state:
    st.session_state.prefill_app_type = "web"

cols = st.columns(3)
for i, ex in enumerate(EXAMPLE_PROMPTS):
    with cols[i % 3]:
        label = f"{ex['icon']} **{ex['title']}**\n\n{ex['prompt'][:65]}…"
        if st.button(label, use_container_width=True, key=f"ex_{i}"):
            st.session_state.prefill_prompt = ex["prompt"]
            st.session_state.prefill_app_type = ex["app_type"]
            st.rerun()

st.divider()

# ---------------------------------------------------------------------------
# Input form
# ---------------------------------------------------------------------------
st.markdown("<div class='section-label'>Your request</div>", unsafe_allow_html=True)

query = st.text_area(
    "request",
    value=st.session_state.prefill_prompt,
    height=110,
    placeholder="e.g. Generate a login test case for Gmail with happy path and invalid password…",
    label_visibility="collapsed",
)

c1, c2 = st.columns([3, 1])
with c1:
    existing_files_input = st.text_input(
        "Protect files (comma-separated)",
        placeholder="e.g. gmail_login.xml",
        help="Files listed here cannot be deleted by the agent during this run.",
    )
with c2:
    st.markdown("<div style='height:28px'></div>", unsafe_allow_html=True)
    run_btn = st.button(
        "▶ Generate",
        type="primary",
        use_container_width=True,
        disabled=(not api_ok or not proxy_ok),
    )

existing_files = [f.strip() for f in existing_files_input.split(",") if f.strip()]

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if run_btn and query.strip():
    st.session_state.prefill_prompt = ""

    payload = {
        "query": query.strip(),
        "app_type": app_type,
        "existing_files": existing_files,
        "model": model_info["id"],
    }

    st.divider()
    st.markdown(
        f"<div class='section-label'>Running with {selected_model_name}</div>",
        unsafe_allow_html=True,
    )

    with st.spinner("Agent working — may take 20–60 seconds…"):
        t0 = time.time()
        try:
            resp = httpx.post(f"{API_BASE}/generate", json=payload, timeout=180)
            elapsed = time.time() - t0
            resp.raise_for_status()
            data = resp.json()
        except httpx.ConnectError:
            st.error("Cannot reach API at localhost:8000.", icon="🚨")
            st.stop()
        except Exception as e:
            st.error(f"Request failed: {e}", icon="🚨")
            st.stop()

    wf = data.get("workflow_type", "GENERATION")
    wf_color = WORKFLOW_COLORS.get(wf, "#888")
    test_cases = data.get("test_cases", [])
    tool_calls = data.get("tool_calls_made", 0)
    retries = data.get("retries", 0)
    model_used = data.get("model_used", "—").split("/")[-1]
    summary = data.get("summary", "")
    est_tokens = tool_calls * 500 + 300
    est_cost = (model_info["input_cost"] + model_info["output_cost"]) * est_tokens / 1_000_000

    # Status badge + summary
    st.markdown(
        f"<span style='background:{wf_color}22;color:{wf_color};"
        f"padding:4px 14px;border-radius:99px;font-weight:700;font-size:13px'>"
        f"● {wf}</span> &nbsp; "
        f"<span style='color:#94a3b8;font-size:14px'>{summary[:140]}</span>",
        unsafe_allow_html=True,
    )
    st.markdown("")

    # Metrics
    m1, m2, m3, m4, m5 = st.columns(5)
    m1.metric("Model", model_used)
    m2.metric("Tool calls", tool_calls)
    m3.metric("Retries", retries)
    m4.metric("Time", f"{elapsed:.1f}s")
    m5.metric("Est. cost", f"${est_cost:.5f}")

    if wf == "QUESTION" and data.get("answer"):
        st.info(data["answer"], icon="💬")

    st.divider()

    # Tabs
    tab_tc, tab_cost, tab_raw = st.tabs([
        f"📋 Test Cases ({len(test_cases)})",
        "💰 Cost Comparison",
        "🔍 Raw JSON",
    ])

    with tab_tc:
        if test_cases:
            for tc in test_cases:
                with st.expander(f"📄 {tc['file_name']}  ·  {tc['title']}", expanded=True):
                    st.code(tc["content"], language="xml")
        else:
            st.info("No test case files written in this run.", icon="ℹ️")

    with tab_cost:
        st.markdown(f"**What this call (~{est_tokens} tokens) would cost on every model:**")
        st.markdown("")

        rows = []
        for p_name, p_data in PROVIDERS.items():
            for m_name, m_data in p_data["models"].items():
                cost = (m_data["input_cost"] + m_data["output_cost"]) * est_tokens / 1_000_000
                rows.append((p_name, m_name, cost, m_data["note"], PROVIDERS[p_name]["color"]))
        rows.sort(key=lambda x: x[2])

        for p_name, m_name, cost, note, color in rows:
            is_sel = m_name == selected_model_name
            marker = "▶ " if is_sel else "&nbsp;&nbsp;"
            vs_selected = est_cost - cost
            if is_sel:
                saving_str = "<span style='color:#64748b'>← selected</span>"
            elif vs_selected > 0:
                saving_str = f"<span style='color:#22c55e'>saves ${vs_selected:.5f}</span>"
            else:
                saving_str = f"<span style='color:#f87171'>+${-vs_selected:.5f}</span>"

            st.markdown(
                f"<div class='cost-row'>{marker}"
                f"<span style='color:{color};font-weight:600'>{m_name}</span>"
                f" &nbsp;<code>${cost:.5f}</code>"
                f" &nbsp;·&nbsp; {saving_str}"
                f" &nbsp;·&nbsp; <span style='color:#64748b'>{note}</span></div>",
                unsafe_allow_html=True,
            )

    with tab_raw:
        st.json(data)

elif run_btn:
    st.warning("Please enter a request first.", icon="⚠️")

# ---------------------------------------------------------------------------
# Footer
# ---------------------------------------------------------------------------
st.divider()
st.caption(
    "**Atto POC — Mode 3** · LiteLLM Proxy (self-hosted, Docker) · "
    "Claude · Gemini · GPT-4o — one orchestration loop · "
    "[GitHub](https://github.com/Bharath-Testsigma/POC-001)"
)
