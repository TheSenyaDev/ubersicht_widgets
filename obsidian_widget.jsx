// ============================================================
// Obsidian Note Widget for Übersicht
// ============================================================
// Requires: brew install pandoc
// Copy to: ~/Library/Application Support/Übersicht/widgets/
// ============================================================

import { css, run, React } from "uebersicht";

// Change these variables 
const VAULT_PATH = "/Users/user0/Documents/senya-vault";
const WIDGET_NAME = "obsidian-note"; // ← change this when copying the file

const WIDGET_DIR = "/Users/user0/Library/Application Support/Übersicht/widgets";
const CONFIG_FILE = WIDGET_DIR + "/" + WIDGET_NAME + ".config.json";
const PANDOC = 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH";';

export const refreshFrequency = 5000;

export const command = `
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  echo "===CONFIG==="
  cat "${CONFIG_FILE}" 2>/dev/null || echo "[]"
  echo "===END_CONFIG==="
  echo "===FILES==="
  find "${VAULT_PATH}" -name "*.md" \
    -not -path "*/.obsidian/*" \
    -not -path "*/.trash/*" \
    -not -path "*/node_modules/*" \
    -type f 2>/dev/null | sort
  echo "===END_FILES==="
`;

// ── Utilities ───────────────────────────────────────────────

function parseOutput(output) {
  var cfgMatch = output.match(/===CONFIG===([\s\S]*?)===END_CONFIG===/);
  var filesMatch = output.match(/===FILES===([\s\S]*?)===END_FILES===/);
  var config = [];
  try { config = JSON.parse((cfgMatch && cfgMatch[1] || "[]").trim()); } catch(e) { config = []; }
  if (!Array.isArray(config)) config = [];
  var files = (filesMatch && filesMatch[1] || "").trim().split("\n").filter(function(f) { return f.length > 0; });
  return { config: config, files: files };
}

function saveConfig(panels) {
  var data = panels.map(function(p) {
    return { id: p.id, x: p.x, y: p.y, pin: p.pin || "", w: p.w || 0, h: p.h || 0, locked: !!p.locked };
  });
  var json = JSON.stringify(data);
  var enc = btoa(unescape(encodeURIComponent(json)));
  run("echo '" + enc + "' | base64 -D > '" + CONFIG_FILE.replace(/'/g, "'\\''") + "'");
}

function loadHtml(filepath) {
  var s = filepath.replace(/'/g, "'\\''");
  return run(
    PANDOC + " sed " +
    "-e 's/==\\([^=]\\{1,\\}\\)==/<mark>\\1<\\/mark>/g' " +
    "-e 's/\\[\\[\\([^]|]*\\)|\\([^]]*\\)\\]\\]/<span class=\"wl\">\\2<\\/span>/g' " +
    "-e 's/\\[\\[\\([^]]*\\)\\]\\]/<span class=\"wl\">\\1<\\/span>/g' " +
    "'" + s + "' | pandoc " +
    "--from=markdown+task_lists+strikeout+pipe_tables+backtick_code_blocks+fenced_code_blocks+yaml_metadata_block+footnotes+definition_lists+raw_html " +
    "--to=html5 --wrap=none --no-highlight 2>/dev/null"
  );
}

function loadRaw(filepath) {
  return run("cat '" + filepath.replace(/'/g, "'\\''") + "'");
}

function saveFile(filepath, content) {
  var s = filepath.replace(/'/g, "'\\''");
  var enc = btoa(unescape(encodeURIComponent(content)));
  return run("echo '" + enc + "' | base64 -D > '" + s + "'");
}

function toggleCheckbox(filepath, index) {
  return loadRaw(filepath).then(function(raw) {
    var count = 0;
    var updated = raw.replace(/^(\s*[-*+] \[)([xX ]?)(\])/gm, function(_, pre, state, post) {
      if (count++ === index) {
        return pre + (state === ' ' ? 'x' : ' ') + post;
      }
      return pre + state + post;
    });
    return saveFile(filepath, updated);
  });
}

function postProcessHtml(html) {
  html = html.replace(
    /<blockquote>\s*<p>\[!(\w+)\]\s*(.*?)<\/p>([\s\S]*?)<\/blockquote>/gi,
    function(_, type, title, body) {
      var t = type.toLowerCase();
      var colors = {
        note:"#7aa2f7",info:"#7aa2f7",tip:"#9ece6a",hint:"#9ece6a",
        important:"#bb9af7",warning:"#e0af68",caution:"#e0af68",
        danger:"#f7768e",error:"#f7768e",bug:"#f7768e",example:"#bb9af7",
        quote:"#636d83",abstract:"#7dcfff",summary:"#7dcfff",todo:"#7aa2f7",
        success:"#9ece6a",question:"#e0af68",fail:"#f7768e",
      };
      var icons = {
        note:"📝",info:"ℹ️",tip:"💡",hint:"💡",important:"❗",
        warning:"⚠️",caution:"⚠️",danger:"🔴",error:"🔴",bug:"🐛",
        example:"📋",quote:"💬",abstract:"📄",summary:"📄",todo:"☑️",
        success:"✅",question:"❓",fail:"❌",
      };
      var c = colors[t] || "#7aa2f7";
      var ic = icons[t] || "📝";
      var dt = title || type.charAt(0).toUpperCase() + type.slice(1);
      return '<div style="border-left:3px solid ' + c + ';background:' + c + '12;border-radius:0 8px 8px 0;padding:10px 14px;margin:10px 0;">' +
        '<div style="font-weight:600;color:' + c + ';margin-bottom:4px;font-size:0.95em;">' + ic + ' ' + dt + '</div>' +
        '<div style="opacity:0.9;">' + body + '</div></div>';
    }
  );
  html = html.replace(/(^|[\s>])#([a-zA-Z0-9_/-]+)/g, function(_, before, tag) {
    return before + '<span class="obs-tag">#' + tag + '</span>';
  });
  var cbIdx = 0;
  html = html.replace(/<input type="checkbox"([^>]*?)>/gi, function(_, attrs) {
    var cleanAttrs = attrs.replace(/\s*disabled/gi, '').replace(/\s*\/$/, '');
    return '<input type="checkbox"' + cleanAttrs + ' data-cb-index="' + (cbIdx++) + '">';
  });
  return html;
}

function buildTree(files) {
  var root = { children: {}, files: [] };
  files.forEach(function(fp) {
    var rel = fp.replace(VAULT_PATH, "").replace(/^\//, "");
    var parts = rel.split("/");
    var name = parts.pop();
    var node = root;
    parts.forEach(function(f) {
      if (!node.children[f]) node.children[f] = { children: {}, files: [] };
      node = node.children[f];
    });
    node.files.push({ name: name.replace(/\.md$/, ""), fullPath: fp });
  });
  return root;
}

function filterTree(node, q) {
  if (!q) return node;
  var ql = q.toLowerCase();
  var ff = node.files.filter(function(f) {
    return f.name.toLowerCase().indexOf(ql) >= 0 || f.fullPath.toLowerCase().indexOf(ql) >= 0;
  });
  var fc = {};
  Object.keys(node.children).forEach(function(k) {
    var c = filterTree(node.children[k], q);
    if (c.files.length || Object.keys(c.children).length) fc[k] = c;
  });
  return { children: fc, files: ff };
}

function countFiles(n) {
  var c = n.files.length;
  Object.keys(n.children).forEach(function(k) { c += countFiles(n.children[k]); });
  return c;
}

function genId() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

// ── Styles ──────────────────────────────────────────────────

export const className = css`
  position: fixed; top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none; z-index: 999;
`;

function cardStyle(x, y, w, h, locked, dragging, isSpecial) {
  var s = {
    position: "absolute", left: x, top: y,
    display: "flex", flexDirection: "column",
    background: "rgba(26,27,38,0.92)",
    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
    border: isSpecial ? "1px solid rgba(122,162,247,0.3)" : "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14, fontSize: 13.5, color: "#c0caf5", lineHeight: 1.65,
    fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif',
    boxShadow: dragging ? "0 12px 48px rgba(0,0,0,0.6)" : "0 8px 40px rgba(0,0,0,0.5)",
    overflow: "hidden", pointerEvents: "auto",
    transition: dragging ? "none" : "box-shadow 0.2s ease,border 0.2s ease",
  };
  if (locked && w > 0 && h > 0) {
    s.width = w; s.height = h;
  } else {
    s.width = 400; s.maxHeight = 560;
  }
  return s;
}

var WIDGET_CSS = [
  '.nc h1,.nc h2,.nc h3,.nc h4,.nc h5,.nc h6{color:#c0caf5;margin-top:20px;margin-bottom:8px;font-weight:700;line-height:1.35}',
  '.nc h1{font-size:1.6em;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:8px;margin-top:4px}',
  '.nc h2{font-size:1.3em;border-bottom:1px solid rgba(255,255,255,0.04);padding-bottom:6px}',
  '.nc h3{font-size:1.15em}.nc h4{font-size:1.05em}.nc h5{font-size:1em;opacity:.85}.nc h6{font-size:.95em;opacity:.75}',
  '.nc p{margin:6px 0}',
  '.nc a{color:#7aa2f7;text-decoration:none}.nc a:hover{text-decoration:underline}',
  '.nc strong,.nc b{color:#c0caf5;font-weight:700}',
  '.nc em,.nc i{font-style:italic}.nc del{opacity:.45;text-decoration:line-through}',
  '.nc mark{background:rgba(224,175,104,0.3);color:#e0af68;padding:1px 4px;border-radius:3px}',
  '.nc code{background:rgba(255,255,255,0.06);padding:2px 5px;border-radius:4px;font-size:.87em;font-family:"SF Mono","Fira Code","JetBrains Mono",Menlo,monospace;color:#e0af68}',
  '.nc pre{background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.04);border-radius:8px;padding:14px 16px;overflow-x:auto;margin:12px 0;line-height:1.55}',
  '.nc pre code{background:none;padding:0;font-size:.85em;color:#a9b1d6}',
  '.nc blockquote{border-left:3px solid rgba(122,162,247,0.5);margin:10px 0;padding:4px 14px;background:rgba(122,162,247,0.04);border-radius:0 6px 6px 0;color:#a9b1d6}',
  '.nc blockquote p{margin:4px 0}',
  '.nc hr{border:none;border-top:1px solid rgba(255,255,255,0.06);margin:18px 0}',
  '.nc ul,.nc ol{margin:6px 0;padding-left:24px}.nc li{margin:2px 0}',
  '.nc li > ul,.nc li > ol{margin:2px 0}',
  '.nc ul.task-list{list-style:none;padding-left:4px}',
  '.nc .task-list .task-list{padding-left:20px}',
  '.nc .task-list li{display:block;margin:4px 0}',
  '.nc input[type="checkbox"]{-webkit-appearance:none;display:inline-block;vertical-align:middle;width:15px;height:15px;border:1.5px solid rgba(255,255,255,0.2);border-radius:4px;margin:0 6px 2px 0;position:relative;cursor:default}',
  '.nc input[type="checkbox"]:checked{background:rgba(158,206,106,0.2);border-color:#9ece6a}',
  '.nc input[type="checkbox"]:checked::after{content:"✓";color:#9ece6a;font-size:11px;position:absolute;top:0;left:2px;font-weight:700}',
  '.nc table{width:100%;border-collapse:collapse;margin:12px 0;font-size:.92em}',
  '.nc th{background:rgba(255,255,255,0.04);font-weight:600;text-align:left;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.08)}',
  '.nc td{padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.03)}',
  '.nc tr:hover td{background:rgba(255,255,255,0.02)}',
  '.nc img{max-width:100%;border-radius:8px;margin:8px 0}',
  '.nc .wl{color:#7aa2f7;cursor:default}',
  '.nc .obs-tag{color:#7dcfff;font-size:.9em;opacity:.75}',
  '.nc .footnotes{margin-top:24px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);font-size:.88em;opacity:.65}',
  '.nc>*:first-child{margin-top:0}',
  '.ws::-webkit-scrollbar{width:5px}.ws::-webkit-scrollbar-track{background:transparent}',
  '.ws::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}',
  '.edit-area{width:100%;height:100%;min-height:300px;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px;color:#c0caf5;font-family:"SF Mono","Fira Code",Menlo,monospace;font-size:12.5px;line-height:1.6;resize:none;outline:none;box-sizing:border-box}',
  '.edit-area:focus{border-color:rgba(122,162,247,0.3)}',
].join("\n");

function btnStyle(active) {
  return {
    background: active ? "rgba(122,162,247,0.2)" : "rgba(255,255,255,0.06)",
    border: active ? "1px solid rgba(122,162,247,0.3)" : "1px solid transparent",
    color: active ? "#7aa2f7" : "#636d83",
    borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
  };
}

var iconBtnStyle = {
  background: "transparent", border: "1px solid transparent", borderRadius: 5,
  padding: "3px 5px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};

// ── SVG Icons ───────────────────────────────────────────────

function EditIcon() {
  return React.createElement("svg", {
    width: 13, height: 13, viewBox: "0 0 24 24", fill: "none",
    stroke: "rgba(255,255,255,0.4)", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
  },
    React.createElement("path", { d: "M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" })
  );
}


function MenuIcon() {
  return React.createElement("svg", {
    width: 16, height: 16, viewBox: "0 0 24 24", fill: "none",
    stroke: "rgba(255,255,255,0.4)", strokeWidth: 2, strokeLinecap: "round",
  },
    React.createElement("circle", { cx: 12, cy: 5, r: 1 }),
    React.createElement("circle", { cx: 12, cy: 12, r: 1 }),
    React.createElement("circle", { cx: 12, cy: 19, r: 1 })
  );
}

function ChevronIcon(props) {
  return React.createElement("svg", {
    width: 10, height: 10, viewBox: "0 0 10 10", fill: "none",
    stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round",
    style: { transform: props.open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease", flexShrink: 0 },
  },
    React.createElement("path", { d: "M3.5 1.5L7 5L3.5 8.5" })
  );
}

// ── Dropdown — rendered at App root to escape backdrop-filter clipping ──

function Dropdown(props) {
  var items = props.items;
  var onClose = props.onClose;
  var top = props.top;
  var left = props.left;

  // Run only on mount/unmount — onClose is stable (calls setState setters)
  React.useEffect(function() {
    function handler(e) {
      if (!e.target.closest(".obs-dropdown")) onClose();
    }
    var timer = setTimeout(function() { window.addEventListener("mousedown", handler); }, 10);
    return function() { clearTimeout(timer); window.removeEventListener("mousedown", handler); };
  }, []);

  return React.createElement("div", {
    className: "obs-dropdown",
    style: {
      position: "fixed", top: top, left: left,
      background: "rgba(30,31,42,0.98)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 8, padding: "4px 0", minWidth: 170, zIndex: 10000,
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      pointerEvents: "auto",
    },
  },
    items.map(function(item, i) {
      if (item.divider) {
        return React.createElement("div", {
          key: i,
          style: { borderTop: "1px solid rgba(255,255,255,0.06)", margin: "4px 0" },
        });
      }
      return React.createElement("div", {
        key: i,
        onClick: function() { item.onClick(); onClose(); },
        style: {
          padding: "7px 14px", cursor: "pointer", fontSize: 12,
          color: item.danger ? "#f7768e" : "#a9b1d6",
          display: "flex", alignItems: "center", gap: 8,
        },
        onMouseEnter: function(e) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; },
        onMouseLeave: function(e) { e.currentTarget.style.background = "transparent"; },
      },
        React.createElement("span", { style: { width: 16, textAlign: "center", fontSize: 13 } }, item.icon),
        React.createElement("span", null, item.label)
      );
    })
  );
}

// ── File Tree ───────────────────────────────────────────────

function TreeNode(props) {
  var node = props.node;
  var depth = props.depth;
  var currentPin = props.currentPin;
  var onSelect = props.onSelect;
  var expanded = props.expanded;
  var toggle = props.toggle;
  var path = props.path;

  var folders = Object.keys(node.children).sort();
  var sorted = node.files.slice().sort(function(a, b) { return a.name.localeCompare(b.name); });
  var pad = depth * 14;
  var elements = [];

  folders.forEach(function(key) {
    var child = node.children[key];
    var fp = path + "/" + key;
    var isOpen = expanded[fp];
    if (!child.files.length && !Object.keys(child.children).length) return;
    elements.push(
      React.createElement("div", { key: "f-" + fp },
        React.createElement("div", {
          onClick: function() { toggle(fp); },
          style: {
            padding: "5px 10px", paddingLeft: 10 + pad, cursor: "pointer",
            borderRadius: 6, fontSize: 12.5, color: "#636d83",
            display: "flex", alignItems: "center", gap: 6, marginBottom: 1, fontWeight: 500,
          },
          onMouseEnter: function(e) { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; },
          onMouseLeave: function(e) { e.currentTarget.style.background = "transparent"; },
        },
          React.createElement(ChevronIcon, { open: isOpen }),
          React.createElement("span", { style: { fontSize: 12, opacity: 0.6 } }, "📁"),
          React.createElement("span", null, key),
          React.createElement("span", { style: { fontSize: 10, opacity: 0.35, marginLeft: "auto" } }, countFiles(child))
        ),
        isOpen ? React.createElement(TreeNode, {
          node: child, depth: depth + 1, currentPin: currentPin,
          onSelect: onSelect, expanded: expanded, toggle: toggle, path: fp,
        }) : null
      )
    );
  });

  sorted.forEach(function(f, i) {
    var active = f.fullPath === currentPin;
    elements.push(
      React.createElement("div", {
        key: "n-" + i + "-" + f.fullPath,
        onClick: function() { onSelect(f.fullPath); },
        style: {
          padding: "5px 10px", paddingLeft: 10 + pad + 16, cursor: "pointer",
          borderRadius: 6, fontSize: 12.5,
          background: active ? "rgba(122,162,247,0.1)" : "transparent",
          color: active ? "#7aa2f7" : "#a9b1d6",
          display: "flex", alignItems: "center", gap: 6, marginBottom: 1,
        },
        onMouseEnter: function(e) { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; },
        onMouseLeave: function(e) { e.currentTarget.style.background = active ? "rgba(122,162,247,0.1)" : "transparent"; },
      },
        React.createElement("span", { style: { fontSize: 11, opacity: 0.45, flexShrink: 0 } }, active ? "📌" : "📄"),
        React.createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 } }, f.name)
      )
    );
  });

  return React.createElement("div", null, elements);
}

// ── Resize Handle ───────────────────────────────────────────

function ResizeHandle(props) {
  return React.createElement("div", {
    onMouseDown: props.onResizeStart,
    style: {
      position: "absolute", bottom: 0, right: 0,
      width: 20, height: 20, cursor: "nwse-resize", zIndex: 10,
      display: "flex", alignItems: "center", justifyContent: "center",
    },
  },
    React.createElement("svg", {
      width: 10, height: 10, viewBox: "0 0 10 10", fill: "none",
      stroke: "rgba(255,255,255,0.25)", strokeWidth: 1.5, strokeLinecap: "round",
    },
      React.createElement("line", { x1: 9, y1: 1, x2: 1, y2: 9 }),
      React.createElement("line", { x1: 9, y1: 5, x2: 5, y2: 9 }),
      React.createElement("line", { x1: 9, y1: 8, x2: 8, y2: 9 })
    )
  );
}

// ── Panel Component ─────────────────────────────────────────

function Panel(props) {
  var panel = props.panel;
  var files = props.files;
  var tree = props.tree;
  var onUpdate = props.onUpdate;
  var onRemove = props.onRemove;
  var onOpenDropdown = props.onOpenDropdown;
  var onCloseDropdown = props.onCloseDropdown;

  var modeState = React.useState(panel.pin ? "view" : "browse");
  var mode = modeState[0]; var setMode = modeState[1];
  var searchState = React.useState("");
  var search = searchState[0]; var setSearch = searchState[1];
  var expandedState = React.useState({});
  var expanded = expandedState[0]; var setExpanded = expandedState[1];
  var menuOpenState = React.useState(false);
  var menuOpen = menuOpenState[0]; var setMenuOpen = menuOpenState[1];
  var contentState = React.useState("");
  var content = contentState[0]; var setContent = contentState[1];
  var rawState = React.useState("");
  var rawContent = rawState[0]; var setRawContent = rawState[1];
  var dragState = React.useState(false);
  var dragging = dragState[0]; var setDragging = dragState[1];
  var dragOffset = React.useRef({ x: 0, y: 0 });
  var resizingState = React.useState(false);
  var resizing = resizingState[0]; var setResizing = resizingState[1];
  var resizeStart = React.useRef({ w: 0, h: 0, mx: 0, my: 0 });
  var menuBtnRef = React.useRef(null);

  // Load HTML content
  React.useEffect(function() {
    if (!panel.pin || mode === "edit") return;
    var cancelled = false;
    function doFetch() {
      loadHtml(panel.pin).then(function(html) {
        if (!cancelled) setContent(postProcessHtml(html));
      }).catch(function() {});
    }
    doFetch();
    var timer = setInterval(doFetch, 6000);
    return function() { cancelled = true; clearInterval(timer); };
  }, [panel.pin, mode]);

  React.useEffect(function() {
    if (!panel.pin && mode !== "browse") setMode("browse");
    else if (panel.pin && mode === "browse") setMode("view");
  }, [panel.pin]);

  var filtered = React.useMemo(function() { return filterTree(tree, search); }, [tree, search]);

  React.useEffect(function() {
    if (!search) return;
    var all = {};
    function collect(n, prefix) {
      Object.keys(n.children).forEach(function(k) {
        var p = prefix + "/" + k;
        all[p] = true;
        collect(n.children[k], p);
      });
    }
    collect(filtered, "");
    setExpanded(function(prev) {
      var next = {};
      Object.keys(prev).forEach(function(k) { next[k] = prev[k]; });
      Object.keys(all).forEach(function(k) { next[k] = true; });
      return next;
    });
  }, [search]);

  // Drag
  var onMouseDown = React.useCallback(function(e) {
    if (mode !== "reposition") return;
    if (e.target.tagName === "BUTTON" || e.target.closest("button")) return;
    e.preventDefault();
    setDragging(true);
    dragOffset.current = { x: e.clientX - panel.x, y: e.clientY - panel.y };
  }, [panel.x, panel.y, mode]);

  React.useEffect(function() {
    if (!dragging) return;
    function onMove(e) {
      var nx = Math.max(0, Math.min(window.innerWidth - 400, e.clientX - dragOffset.current.x));
      var ny = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.current.y));
      onUpdate({ id: panel.id, x: nx, y: ny, pin: panel.pin, w: panel.w, h: panel.h, locked: panel.locked });
    }
    function onUp() { setDragging(false); setMode(panel.pin ? "view" : "browse"); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return function() { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, panel.id, panel.pin, panel.w, panel.h, panel.locked]);

  // Resize
  function onResizeStart(e) {
    e.preventDefault(); e.stopPropagation();
    var cardEl = e.target.closest("[data-panel-card]");
    var rect = cardEl ? cardEl.getBoundingClientRect() : { width: 400, height: 400 };
    resizeStart.current = { w: rect.width, h: rect.height, mx: e.clientX, my: e.clientY };
    setResizing(true);
  }

  React.useEffect(function() {
    if (!resizing) return;
    function onMove(e) {
      var dw = e.clientX - resizeStart.current.mx;
      var dh = e.clientY - resizeStart.current.my;
      var nw = Math.max(280, resizeStart.current.w + dw);
      var nh = Math.max(150, resizeStart.current.h + dh);
      onUpdate({ id: panel.id, x: panel.x, y: panel.y, pin: panel.pin, w: Math.round(nw), h: Math.round(nh), locked: true });
    }
    function onUp() {
      setResizing(false);
      setMode(panel.pin ? "view" : "browse");
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return function() { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [resizing, panel.id, panel.x, panel.y, panel.pin]);

  var noteName = panel.pin
    ? panel.pin.replace(VAULT_PATH, "").replace(/^\//, "").replace(/\.md$/, "")
    : "";

  function selectNote(fp) {
    onUpdate({ id: panel.id, x: panel.x, y: panel.y, pin: fp, w: panel.w, h: panel.h, locked: panel.locked });
    setMode("view");
  }

  function openInObsidian() {
    if (!panel.pin) return;
    var vn = VAULT_PATH.split("/").pop();
    var rel = panel.pin.replace(VAULT_PATH, "").replace(/^\//, "");
    run('open "obsidian://open?vault=' + encodeURIComponent(vn) + '&file=' + encodeURIComponent(rel) + '"');
  }

  function startEdit() {
    if (!panel.pin) return;
    loadRaw(panel.pin).then(function(raw) { setRawContent(raw); setMode("edit"); });
  }

  function saveEdit() {
    if (!panel.pin) return;
    saveFile(panel.pin, rawContent).then(function() {
      setMode("view");
      loadHtml(panel.pin).then(function(html) { setContent(postProcessHtml(html)); });
    });
  }

  function startResize() {
    if (!panel.locked) {
      onUpdate({ id: panel.id, x: panel.x, y: panel.y, pin: panel.pin, w: panel.w || 400, h: panel.h || 400, locked: true });
    }
    setMode("resize");
  }

  var menuItems = [
    { icon: "🔄", label: "Change note", onClick: function() { setSearch(""); setMode("browse"); } },
  ];
  if (panel.pin) {
    menuItems.push({ icon: "↗️", label: "Open in Obsidian", onClick: openInObsidian });
  }
  menuItems.push({ icon: "📐", label: "Reposition", onClick: function() { setMode("reposition"); } });
  menuItems.push({ icon: "↔️", label: "Resize", onClick: startResize });
  if (panel.locked) {
    menuItems.push({ icon: "📏", label: "Auto size", onClick: function() {
      onUpdate({ id: panel.id, x: panel.x, y: panel.y, pin: panel.pin, w: 0, h: 0, locked: false });
    }});
  }
  menuItems.push({ divider: true });
  menuItems.push({ icon: "✕", label: "Remove widget", onClick: onRemove, danger: true });

  var isRepo = mode === "reposition";
  var isResize = mode === "resize";
  var isSpecial = isRepo || isResize;

  // Header buttons
  var headerButtons = [];

  if (mode === "edit") {
    headerButtons.push(
      React.createElement("button", { key: "save", style: btnStyle(true), onClick: saveEdit }, "Save"),
      React.createElement("button", { key: "cancel", style: btnStyle(false), onClick: function() { setMode("view"); } }, "Cancel")
    );
  }

  if (mode === "browse" && panel.pin && content) {
    headerButtons.push(
      React.createElement("button", { key: "back", style: btnStyle(true), onClick: function() { setMode("view"); } }, "Back")
    );
  }

  if (isSpecial && !dragging && !resizing) {
    headerButtons.push(
      React.createElement("button", { key: "done", style: btnStyle(true), onClick: function() { setMode(panel.pin ? "view" : "browse"); } }, "Done")
    );
  }

  if (mode === "view" || mode === "browse") {
    // Edit button (only when a note is pinned)
    if (panel.pin) {
      headerButtons.push(
        React.createElement("button", {
          key: "edit", style: iconBtnStyle, onClick: startEdit, title: "Edit note",
          onMouseEnter: function(e) { e.currentTarget.style.color = "#c0caf5"; },
          onMouseLeave: function(e) { e.currentTarget.style.color = ""; },
        }, React.createElement(EditIcon))
      );
    }

    // Menu button — opens dropdown at App root level (outside backdrop-filter)
    headerButtons.push(
      React.createElement("div", { key: "menu", ref: menuBtnRef },
        React.createElement("button", {
          onClick: function(e) {
            e.stopPropagation();
            if (menuOpen) {
              setMenuOpen(false);
              onCloseDropdown();
            } else {
              setMenuOpen(true);
              var r = menuBtnRef.current ? menuBtnRef.current.getBoundingClientRect() : { bottom: 40, right: 400 };
              onOpenDropdown({
                items: menuItems,
                top: r.bottom + 4,
                left: r.right - 170,
                onClose: function() { setMenuOpen(false); },
              });
            }
          },
          style: Object.assign({}, iconBtnStyle, menuOpen ? { background: "rgba(255,255,255,0.06)" } : {}),
        }, React.createElement(MenuIcon))
      )
    );
  }

  // Content area
  var contentArea = null;

  if (mode === "browse") {
    var treeContent = null;
    if (files.length === 0) {
      treeContent = React.createElement("div", { style: { opacity: 0.4, padding: "20px 0", textAlign: "center" } }, "No notes found — check VAULT_PATH.");
    } else if (!filtered.files.length && !Object.keys(filtered.children).length) {
      treeContent = React.createElement("div", { style: { opacity: 0.4, padding: "20px 0", textAlign: "center" } }, "No matches");
    } else {
      treeContent = React.createElement(TreeNode, {
        node: filtered, depth: 0, currentPin: panel.pin,
        onSelect: selectNote, expanded: expanded,
        toggle: function(p) { setExpanded(function(prev) { var n = {}; Object.keys(prev).forEach(function(k) { n[k] = prev[k]; }); n[p] = !prev[p]; return n; }); },
        path: "",
      });
    }
    contentArea = React.createElement("div", {
      className: "ws",
      style: { flex: 1, overflowY: "auto", padding: "8px 12px 14px 12px" },
    },
      React.createElement("input", {
        type: "text", placeholder: "Search notes…",
        style: {
          width: "100%", boxSizing: "border-box",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 8, padding: "8px 12px", color: "#c0caf5",
          fontSize: 13, fontFamily: "inherit", outline: "none", margin: "4px 0 8px 0",
        },
        value: search, onChange: function(e) { setSearch(e.target.value); },
      }),
      treeContent
    );
  } else if ((mode === "view" || mode === "resize") && content) {
    contentArea = React.createElement("div", {
      className: "ws",
      style: { flex: 1, overflowY: "auto", padding: "10px 16px 16px 16px" },
      onClick: function(e) {
        if (e.target.type === "checkbox" && panel.pin) {
          e.preventDefault();
          var idx = parseInt(e.target.getAttribute("data-cb-index"), 10);
          if (!isNaN(idx)) {
            toggleCheckbox(panel.pin, idx).then(function() {
              loadHtml(panel.pin).then(function(html) { setContent(postProcessHtml(html)); });
            });
          }
        }
      },
    },
      React.createElement("div", { className: "nc", dangerouslySetInnerHTML: { __html: content } })
    );
  } else if (mode === "edit") {
    contentArea = React.createElement("div", {
      className: "ws",
      style: { flex: 1, overflowY: "auto", padding: "10px 14px 14px 14px" },
    },
      React.createElement("textarea", {
        className: "edit-area",
        value: rawContent,
        onChange: function(e) { setRawContent(e.target.value); },
        spellCheck: false,
      })
    );
  } else if (mode === "view" && !content && !panel.pin) {
    contentArea = React.createElement("div", {
      style: {
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "40px 20px", textAlign: "center",
      },
    },
      React.createElement("div", { style: { fontSize: 28, marginBottom: 12 } }, "📌"),
      React.createElement("div", { style: { opacity: 0.5, marginBottom: 16 } }, "No note pinned"),
      React.createElement("button", {
        style: Object.assign({}, btnStyle(true), { padding: "8px 20px", fontSize: 13 }),
        onClick: function() { setMode("browse"); },
      }, "Browse vault")
    );
  }

  // Hint bar for special modes
  var hintBar = null;
  if (isRepo && !dragging) {
    hintBar = React.createElement("div", {
      style: {
        padding: "8px 16px", background: "rgba(122,162,247,0.08)",
        borderBottom: "1px solid rgba(122,162,247,0.15)",
        fontSize: 11.5, color: "#7aa2f7", textAlign: "center", flexShrink: 0,
      },
    }, "Grab the header bar to move");
  }
  if (isResize && !resizing) {
    hintBar = React.createElement("div", {
      style: {
        padding: "8px 16px", background: "rgba(122,162,247,0.08)",
        borderBottom: "1px solid rgba(122,162,247,0.15)",
        fontSize: 11.5, color: "#7aa2f7", textAlign: "center", flexShrink: 0,
      },
    }, "Drag the corner handle to resize");
  }

  var showResizeHandle = isResize;

  return React.createElement("div", { "data-panel-card": "1", style: cardStyle(panel.x, panel.y, panel.w, panel.h, panel.locked, dragging || resizing, isSpecial) },
    React.createElement("style", { dangerouslySetInnerHTML: { __html: WIDGET_CSS } }),

    // Header
    React.createElement("div", {
      onMouseDown: onMouseDown,
      style: {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px 8px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        flexShrink: 0,
        cursor: isRepo ? (dragging ? "grabbing" : "grab") : "default",
        userSelect: "none",
      },
    },
      React.createElement("div", {
        style: { display: "flex", alignItems: "center", gap: 8, overflow: "hidden", flex: 1 },
      },
        React.createElement("span", {
          style: {
            fontWeight: 600, fontSize: 13,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            color: isSpecial ? "#7aa2f7" : "#c0caf5",
          },
        },
          isRepo ? "Drag to reposition"
          : isResize ? "Drag corner to resize"
          : mode === "browse" ? "Select a note"
          : mode === "edit" ? "Editing: " + (noteName.split("/").pop() || "")
          : noteName || "Obsidian"
        )
      ),
      React.createElement("div", {
        style: { display: "flex", alignItems: "center", gap: 4, flexShrink: 0 },
      }, headerButtons)
    ),

    hintBar,
    contentArea,
    showResizeHandle ? React.createElement(ResizeHandle, { onResizeStart: onResizeStart }) : null
  );
}

// ── Main Render ─────────────────────────────────────────────

export var render = function(args) {
  if (args.error) {
    return React.createElement("div", { style: { padding: 20, pointerEvents: "auto" } },
      React.createElement("div", { style: { color: "#f7768e", fontWeight: 600 } }, "Error"),
      React.createElement("div", { style: { opacity: 0.7, fontSize: "0.9em", marginTop: 6 } }, args.error)
    );
  }
  var parsed = parseOutput(args.output || "");
  return React.createElement(App, { initialConfig: parsed.config, files: parsed.files });
};

function App(props) {
  var initialConfig = props.initialConfig;
  var files = props.files;

  var panelsState = React.useState(function() {
    if (initialConfig && initialConfig.length > 0) return initialConfig;
    return [{ id: genId(), x: Math.max(0, window.innerWidth - 440), y: 40, pin: "", w: 0, h: 0, locked: false }];
  });
  var panels = panelsState[0];
  var setPanels = panelsState[1];

  // Dropdown rendered here (App root) so it is never inside a backdrop-filter element
  var dropdownState = React.useState(null);
  var dropdown = dropdownState[0]; var setDropdown = dropdownState[1];

  var tree = React.useMemo(function() { return buildTree(files); }, [files]);

  function updatePanel(updated) {
    setPanels(function(prev) {
      var next = prev.map(function(p) { return p.id === updated.id ? updated : p; });
      saveConfig(next);
      return next;
    });
  }

  function removePanel(id) {
    setPanels(function(prev) {
      var next = prev.filter(function(p) { return p.id !== id; });
      saveConfig(next);
      return next;
    });
  }

  function addPanel() {
    var cols = Math.max(1, Math.floor(window.innerWidth / 440));
    var idx = panels.length;
    var np = { id: genId(), x: 20 + (idx % cols) * 440, y: 20 + Math.floor(idx / cols) * 300, pin: "", w: 0, h: 0, locked: false };
    setPanels(function(prev) { var next = prev.concat([np]); saveConfig(next); return next; });
  }

  function openDropdown(d) {
    setDropdown(function(prev) {
      if (prev && prev.onClose) prev.onClose();
      return d;
    });
  }

  function closeDropdown() {
    setDropdown(function(prev) {
      if (prev && prev.onClose) prev.onClose();
      return null;
    });
  }

  var children = [];

  panels.forEach(function(p) {
    children.push(React.createElement(Panel, {
      key: p.id, panel: p, files: files, tree: tree,
      onUpdate: updatePanel,
      onRemove: function() { removePanel(p.id); },
      onOpenDropdown: openDropdown,
      onCloseDropdown: closeDropdown,
    }));
  });

  // Add button (shown when no panels exist)
  if (panels.length === 0) {
    children.push(
      React.createElement("div", {
        key: "add-btn",
        style: { position: "fixed", bottom: 20, left: 20, pointerEvents: "auto" },
      },
        React.createElement("button", {
          onClick: addPanel,
          title: "Add a new note widget",
          style: {
            width: 40, height: 40, borderRadius: "50%",
            background: "rgba(26,27,38,0.9)",
            border: "1px solid rgba(122,162,247,0.3)",
            color: "#7aa2f7", fontSize: 22, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            fontFamily: "inherit", lineHeight: 1,
          },
        }, "+")
      )
    );
  }

  // Dropdown rendered at root level — position:fixed works correctly here
  if (dropdown) {
    children.push(
      React.createElement(Dropdown, {
        key: "root-dropdown",
        items: dropdown.items,
        top: dropdown.top,
        left: dropdown.left,
        onClose: function() { if (dropdown.onClose) dropdown.onClose(); setDropdown(null); },
      })
    );
  }

  return React.createElement("div", null, children);
}
