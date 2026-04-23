"""
Atto POC — Streamlit Demo UI
Run with: uv run streamlit run ui.py
"""

import json
import time
import httpx
import streamlit as st

API_BASE = "http://localhost:8000"

# ---------------------------------------------------------------------------
# Model catalogue: name, provider, input $/1M tokens, output $/1M tokens
# ---------------------------------------------------------------------------
MODELS = {
    "Claude Haiku 4.5  (default)": {
        "id": "openai/claude-haiku",
        "input_cost": 0.80,
        "output_cost": 4.00,
        "badge": "🟡 Fast",
    },
    "Claude Sonnet 4.6": {
        "id": "openai/claude-sonnet",
        "input_cost": 3.00,
        "output_cost": 15.00,
        "badge": "🔴 Powerful",
    },
    "Gemini 2.0 Flash": {
        "id": "openai/gemini-flash",
        "input_cost": 0.10,
        "output_cost": 0.40,
        "badge": "🟢 Cheapest",
    },
    "Gemini 2.0 Flash Lite": {
        "id": "openai/gemini-flash-lite",
        "input_cost": 0.075,
        "output_cost": 0.30,
        "badge": "🟢 Ultra Cheap",
    },
    "Gemini 2.5 Flash": {
        "id": "openai/gemini-2.5-flash",
        "input_cost": 0.15,
        "output_cost": 0.60,
        "badge": "🔵 Balanced",
    },
    "Gemini 2.5 Pro": {
        "id": "openai/gemini-pro",
        "input_cost": 1.25,
        "output_cost": 10.00,
        "badge": "🔴 Powerful",
    },
    "GPT-4o Mini": {
        "id": "openai/gpt-4o-mini",
        "input_cost": 0.15,
        "output_cost": 0.60,
        "badge": "🟢 Cheap",
    },
    "GPT-4o": {
        "id": "openai/gpt-4o",
        "input_cost": 5.00,
        "output_cost": 15.00,
        "badge": "🔴 Premium",
    },
}

WORKFLOW_COLORS = {
    "GENERATION": "#2ecc71",
    "EDIT": "#3498db",
    "QUESTION": "#e67e22",
}


# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="Atto POC — AI Test Generator",
    page_icon="🤖",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
    .metric-card {
        background: #1e1e2e;
        border-radius: 8px;
        padding: 16px;
        text-align: center;
    }
    .xml-block {
        background: #0d1117;
        border-radius: 6px;
        font-family: monospace;
        font-size: 13px;
        padding: 12px;
        overflow-x: auto;
        white-space: pre;
    }
    .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 99px;
        font-size: 12px;
        font-weight: 600;
        margin-left: 6px;
    }
    .tool-row {
        border-left: 3px solid #3498db;
        padding-left: 10px;
        margin-bottom: 8px;
        font-family: monospace;
        font-size: 13px;
    }
</style>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------
with st.sidebar:
    st.title("⚙️ Configuration")

    selected_model_name = st.selectbox(
        "Model",
        list(MODELS.keys()),
        help="All models route through the local LiteLLM proxy. Switch freely.",
    )
    model_info = MODELS[selected_model_name]
    st.caption(f"{model_info['badge']}  |  Input: **${model_info['input_cost']}/1M**  |  Output: **${model_info['output_cost']}/1M**")

    app_type = st.selectbox("App Type", ["web", "mobile", "api"])

    st.divider()
    st.subheader("💰 Cost Comparison")
    st.caption("Approximate cost per ~1000 tokens (typical test case generation)")

    cost_rows = []
    for name, info in MODELS.items():
        approx = (info["input_cost"] * 0.5 + info["output_cost"] * 0.5) / 1000
        cost_rows.append({"Model": name.split("(")[0].strip(), "$/call est.": f"${approx:.4f}", "Badge": info["badge"]})

    for row in cost_rows:
        is_selected = row["Model"].strip() in selected_model_name
        prefix = "▶ " if is_selected else "  "
        st.markdown(f"`{prefix}{row['Model']}` — {row['$/call est.']} {row['Badge']}")

    st.divider()
    st.subheader("🗂️ Workspace")
    if st.button("🗑️ Clear workspace", use_container_width=True):
        try:
            httpx.delete(f"{API_BASE}/workspace")
            st.success("Workspace cleared.")
            st.rerun()
        except Exception as e:
            st.error(f"API not reachable: {e}")

    try:
        r = httpx.get(f"{API_BASE}/workspace", timeout=3)
        files = r.json().get("files", [])
        if files:
            for f in files:
                st.markdown(f"📄 `{f['file_name']}` ({f['size_bytes']}B)")
        else:
            st.caption("No files yet.")
    except Exception:
        st.caption("_(API offline)_")


# ---------------------------------------------------------------------------
# Main panel
# ---------------------------------------------------------------------------
st.title("🤖 Atto POC — AI Test Case Generator")
st.caption(
    "Replicates Testsigma's Atto system using **LiteLLM Proxy** (self-hosted). "
    "Swap any model without changing a line of orchestration code."
)

# Sample prompts
st.markdown("**Try a prompt:**")
col1, col2, col3 = st.columns(3)
prefill = ""
if col1.button("Gmail Login test"):
    prefill = "Generate a login test case for Gmail including happy path and invalid password scenario"
if col2.button("API endpoint test"):
    prefill = "Generate a test case for a POST /login REST API endpoint that returns a JWT token"
if col3.button("Edit existing"):
    prefill = "Add a logout step to any existing test case in the workspace"

query = st.text_area(
    "Your request",
    value=prefill,
    height=90,
    placeholder="e.g. Generate a login test case for Gmail...",
)

existing_files_input = st.text_input(
    "Existing files (comma-separated, to protect from deletion)",
    placeholder="e.g. gmail_login.xml, checkout.xml",
)
existing_files = [f.strip() for f in existing_files_input.split(",") if f.strip()]

run_btn = st.button("▶ Generate", type="primary", use_container_width=True)

# ---------------------------------------------------------------------------
# Run generation
# ---------------------------------------------------------------------------
if run_btn and query.strip():
    payload = {
        "query": query.strip(),
        "app_type": app_type,
        "existing_files": existing_files,
        "model": model_info["id"],
    }

    st.info(f"Sending to API with model: `{model_info['id']}`", icon="ℹ️")

    with st.spinner("Running agentic loop…"):
        t0 = time.time()
        try:
            response = httpx.post(
                f"{API_BASE}/generate",
                json=payload,
                timeout=120,
            )
            elapsed = time.time() - t0
            response.raise_for_status()
            data = response.json()
        except httpx.ConnectError:
            st.error("Cannot reach API at localhost:8000. Is `uv run main.py` running?")
            st.stop()
        except Exception as e:
            st.error(f"Request failed: {e}")
            st.stop()

    # ------------------------------------------------------------------
    # Results header
    # ------------------------------------------------------------------
    wf = data.get("workflow_type", "GENERATION")
    color = WORKFLOW_COLORS.get(wf, "#888")
    st.markdown(
        f"<h3>Result — <span style='color:{color}'>{wf}</span></h3>",
        unsafe_allow_html=True,
    )

    m1, m2, m3, m4, m5 = st.columns(5)
    m1.metric("Workflow", wf)
    m2.metric("Model", data.get("model_used", "—").split("/")[-1])
    m3.metric("Tool calls", data.get("tool_calls_made", 0))
    m4.metric("Retries", data.get("retries", 0))
    m5.metric("Elapsed", f"{elapsed:.1f}s")

    est_tokens = data.get("tool_calls_made", 1) * 500 + 300
    est_cost = (model_info["input_cost"] * est_tokens / 1_000_000
                + model_info["output_cost"] * est_tokens / 1_000_000)
    st.caption(
        f"Estimated cost this call: **~${est_cost:.5f}** "
        f"({est_tokens} est. tokens @ {selected_model_name.split('(')[0].strip()})"
    )

    st.markdown(f"**Summary:** {data.get('summary', '')}")

    if wf == "QUESTION" and data.get("answer"):
        st.info(data["answer"], icon="💬")

    # ------------------------------------------------------------------
    # Generated test cases
    # ------------------------------------------------------------------
    test_cases = data.get("test_cases", [])
    if test_cases:
        st.subheader(f"📋 Generated Test Cases ({len(test_cases)})")
        for tc in test_cases:
            with st.expander(f"📄 {tc['file_name']}  —  {tc['title']}", expanded=True):
                st.markdown(f"**File:** `{tc['file_name']}`")
                st.code(tc["content"], language="xml")

    # ------------------------------------------------------------------
    # Raw JSON (collapsed)
    # ------------------------------------------------------------------
    with st.expander("🔍 Raw API response (JSON)"):
        st.json(data)

    # ------------------------------------------------------------------
    # Cost comparison sidebar callout
    # ------------------------------------------------------------------
    st.divider()
    st.subheader("💡 Cost comparison for this exact call")
    cols = st.columns(len(MODELS))
    for i, (name, info) in enumerate(MODELS.items()):
        cost = (info["input_cost"] * est_tokens / 1_000_000
                + info["output_cost"] * est_tokens / 1_000_000)
        short = name.split("(")[0].strip().split("  ")[0]
        delta = None
        # Compare to Claude 3.5 Sonnet as baseline
        sonnet_cost = (3.00 * est_tokens / 1_000_000 + 15.00 * est_tokens / 1_000_000)
        if cost < sonnet_cost:
            delta = f"-{((sonnet_cost - cost) / sonnet_cost * 100):.0f}% vs Sonnet"
        cols[i].metric(short, f"${cost:.5f}", delta=delta, delta_color="inverse")

elif run_btn:
    st.warning("Please enter a query first.")

# ---------------------------------------------------------------------------
# Footer
# ---------------------------------------------------------------------------
st.divider()
st.caption(
    "**Atto POC** · LiteLLM Proxy (self-hosted) · "
    "All models share the same orchestration loop · "
    "[GitHub](https://github.com/Bharath-Testsigma/POC-001)"
)
