frappe.ui.form.on("Actividade do Plano", {
	refresh(frm) {
		setup_autocomplete(frm, "orador");
		setup_autocomplete(frm, "local");
	},
});

function setup_autocomplete(frm, fieldname) {
	const field = frm.get_field(fieldname);
	if (!field || !field.$input) return;

	const input    = field.$input[0];
	let   timer    = null;
	let   dropdown = null;
	let   selIdx   = -1;

	// ── Dropdown element (appended to body, position:fixed) ─────────────────
	function get_dd() {
		if (!dropdown) {
			dropdown = document.createElement("div");
			Object.assign(dropdown.style, {
				position:     "fixed",
				background:   "#ffffff",
				border:       "1px solid #d1d5db",
				borderRadius: "6px",
				boxShadow:    "0 8px 24px rgba(0,0,0,0.13), 0 2px 6px rgba(0,0,0,0.07)",
				zIndex:       "99999",
				maxHeight:    "220px",
				overflowY:    "auto",
				minWidth:     "180px",
				display:      "none",
			});
			document.body.appendChild(dropdown);
		}
		return dropdown;
	}

	function position_dd() {
		if (!dropdown || !dropdown.children.length) return;
		const r = input.getBoundingClientRect();
		Object.assign(dropdown.style, {
			top:   (r.bottom + 3) + "px",
			left:  r.left + "px",
			width: r.width + "px",
		});
	}

	function hide() {
		if (dropdown) { dropdown.innerHTML = ""; dropdown.style.display = "none"; }
		selIdx = -1;
	}

	function highlight(items, idx) {
		items.forEach((el, i) => {
			el.style.background = i === idx ? "#eef2ff" : "";
			el.style.color      = i === idx ? "#4f46e5" : "#374151";
		});
	}

	function render(suggestions) {
		if (!suggestions.length) { hide(); return; }
		const dd = get_dd();
		dd.innerHTML    = "";
		dd.style.display = "block";

		suggestions.forEach((text, i) => {
			const el = document.createElement("div");
			el.textContent = text;
			Object.assign(el.style, {
				padding:      "8px 14px",
				cursor:       "pointer",
				fontSize:     "13px",
				color:        "#374151",
				whiteSpace:   "nowrap",
				overflow:     "hidden",
				textOverflow: "ellipsis",
			});
			el.addEventListener("mouseover", () => { selIdx = i; highlight(Array.from(dd.children), i); });
			el.addEventListener("mouseout",  () => { el.style.background = ""; el.style.color = "#374151"; });
			el.addEventListener("mousedown", (e) => {
				e.preventDefault();
				frm.set_value(fieldname, text);
				hide();
			});
			dd.appendChild(el);
		});

		position_dd();
	}

	function fetch(query) {
		frappe.call({
			method: "portal.catequista.page.plano_anual.plano_anual.get_field_suggestions",
			args:   { fieldname, query },
			callback(r) { render(r.message || []); },
		});
	}

	// ── Events ───────────────────────────────────────────────────────────────
	input.addEventListener("input", () => {
		clearTimeout(timer);
		const q = input.value.trim();
		if (q.length < 2) { hide(); return; }
		timer = setTimeout(() => fetch(q), 300);
	});

	input.addEventListener("focus", () => {
		if (input.value.trim().length >= 2) input.dispatchEvent(new Event("input"));
	});

	input.addEventListener("blur", () => setTimeout(hide, 150));

	input.addEventListener("keydown", (e) => {
		if (!dropdown || dropdown.style.display === "none") return;
		const items = Array.from(dropdown.children);
		if (e.key === "ArrowDown") {
			e.preventDefault();
			selIdx = Math.min(selIdx + 1, items.length - 1);
			highlight(items, selIdx);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			selIdx = Math.max(selIdx - 1, 0);
			highlight(items, selIdx);
		} else if (e.key === "Enter" && selIdx >= 0) {
			e.preventDefault();
			frm.set_value(fieldname, items[selIdx].textContent);
			hide();
		} else if (e.key === "Escape") {
			hide();
		}
	});

	window.addEventListener("scroll",  position_dd, true);
	window.addEventListener("resize",  position_dd);
}
