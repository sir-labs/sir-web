import { StreamLanguage, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { EditorView, keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";

// ── Tokenizer ─────────────────────────────────────────────────────────────────

interface State {
  inMath: boolean;
  doubleMath: boolean;
}

const latexParser = StreamLanguage.define<State>({
  startState: () => ({ inMath: false, doubleMath: false }),

  token(stream, state) {
    if (state.inMath) {
      if (state.doubleMath && stream.match("$$")) {
        state.inMath = false;
        return "string";
      }
      if (!state.doubleMath && stream.match("$")) {
        state.inMath = false;
        return "string";
      }
      if (!state.doubleMath && stream.eol()) {
        state.inMath = false;
        return "string";
      }
      stream.next();
      return "string";
    }

    if (stream.match(/^%.*$/)) return "comment";

    if (stream.match("$$")) {
      state.inMath = true;
      state.doubleMath = true;
      return "string";
    }

    if (stream.match("$")) {
      state.inMath = true;
      state.doubleMath = false;
      return "string";
    }

    if (stream.match(/^\\\w+/)) return "keyword";
    if (stream.match(/^\\./)) return "keyword";
    if (stream.match(/^[{}[\]]/)) return "bracket";

    stream.next();
    return null;
  },
});

// ── Autocomplete data ─────────────────────────────────────────────────────────

const COMMANDS = [
  // Document
  "documentclass", "usepackage", "begin", "end",
  "title", "author", "date", "maketitle", "tableofcontents",
  // Structure
  "part", "chapter", "section", "subsection", "subsubsection",
  "paragraph", "subparagraph", "appendix",
  // Text formatting
  "textbf", "textit", "texttt", "textsc", "textsf", "textrm",
  "underline", "emph", "textcolor", "colorbox",
  // Font sizes
  "tiny", "scriptsize", "footnotesize", "small", "normalsize",
  "large", "Large", "LARGE", "huge", "Huge",
  // Math – operators
  "frac", "dfrac", "tfrac", "sqrt", "sum", "prod", "int", "oint",
  "iint", "iiint", "lim", "sup", "inf", "max", "min",
  "partial", "nabla", "infty",
  // Math – Greek (lowercase)
  "alpha", "beta", "gamma", "delta", "epsilon", "varepsilon",
  "zeta", "eta", "theta", "vartheta", "iota", "kappa", "lambda",
  "mu", "nu", "xi", "pi", "varpi", "rho", "varrho", "sigma",
  "varsigma", "tau", "upsilon", "phi", "varphi", "chi", "psi", "omega",
  // Math – Greek (uppercase)
  "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi",
  "Sigma", "Upsilon", "Phi", "Psi", "Omega",
  // Math – relations
  "leq", "geq", "neq", "approx", "equiv", "sim", "simeq",
  "subset", "supset", "subseteq", "supseteq", "in", "notin",
  "cup", "cap", "setminus", "emptyset",
  "forall", "exists", "nexists",
  // Math – arrows
  "to", "gets", "rightarrow", "leftarrow", "Rightarrow", "Leftarrow",
  "leftrightarrow", "Leftrightarrow", "mapsto", "hookrightarrow",
  "uparrow", "downarrow", "Uparrow", "Downarrow", "updownarrow",
  "nearrow", "searrow", "swarrow", "nwarrow",
  // Math – binary ops
  "times", "div", "pm", "mp", "cdot", "circ", "bullet",
  "oplus", "otimes", "odot", "ominus", "ast", "star",
  // Math – delimiters
  "left", "right", "bigl", "bigr", "Bigl", "Bigr",
  "langle", "rangle", "lfloor", "rfloor", "lceil", "rceil",
  // Math – accents
  "vec", "hat", "bar", "tilde", "dot", "ddot", "breve", "check",
  "widehat", "widetilde", "overline", "underline",
  "overbrace", "underbrace",
  // Math – fonts
  "mathbf", "mathit", "mathrm", "mathbb", "mathcal", "mathfrak",
  "mathsf", "mathtt", "boldsymbol",
  // Math – misc
  "ldots", "cdots", "vdots", "ddots",
  "quad", "qquad", "hspace", "vspace",
  // References & citations
  "label", "ref", "eqref", "pageref", "cite", "citep", "citet",
  "bibitem", "bibliography", "bibliographystyle",
  // Floats & graphics
  "includegraphics", "caption", "subcaption",
  "centering", "raggedright", "raggedleft",
  // Tables
  "hline", "cline", "multicolumn", "multirow", "toprule",
  "midrule", "bottomrule",
  // Spacing & layout
  "newline", "linebreak", "pagebreak", "newpage", "clearpage",
  "noindent", "indent", "smallskip", "medskip", "bigskip",
  "hfill", "vfill",
  // Misc
  "footnote", "footnotemark", "footnotetext",
  "href", "url", "hyperref",
  "today", "LaTeX", "TeX", "textbackslash",
  "newcommand", "renewcommand", "newenvironment", "renewenvironment",
  "setlength", "addtolength", "setcounter", "addtocounter",
  "input", "include", "includeonly",
  "item",
];

const ENVIRONMENTS = [
  "document",
  "equation", "equation*",
  "align", "align*", "aligned", "alignat", "alignat*",
  "gather", "gather*", "multline", "multline*",
  "flalign", "flalign*",
  "split",
  "cases", "dcases",
  "matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix",
  "itemize", "enumerate", "description",
  "figure", "figure*", "table", "table*",
  "tabular", "tabular*", "tabularx", "array",
  "center", "flushleft", "flushright",
  "minipage", "wrapfigure",
  "verbatim", "verbatim*", "lstlisting", "minted",
  "abstract",
  "theorem", "lemma", "proof", "definition", "corollary",
  "proposition", "remark", "example", "exercise",
  "tikzpicture", "scope",
  "frame",
];

const PACKAGES = [
  "amsmath", "amssymb", "amsfonts", "amsthm",
  "fontspec", "inputenc", "fontenc",
  "babel", "polyglossia",
  "geometry", "layout",
  "graphicx", "graphics", "epsfig",
  "xcolor", "color",
  "hyperref", "url",
  "booktabs", "tabularx", "longtable", "multirow",
  "listings", "minted", "verbatim",
  "tikz", "pgfplots", "pgf",
  "float", "wrapfig", "subfig", "subcaption",
  "natbib", "biblatex",
  "microtype", "setspace",
  "fancyhdr", "titlesec",
  "enumitem", "paralist",
  "cleveref", "varioref",
  "algorithm", "algorithmic", "algorithmicx",
  "siunitx", "physics",
  "tcolorbox", "mdframed",
  "beamer",
  "mathtools", "unicode-math",
];

// ── Completion source ─────────────────────────────────────────────────────────

function latexCompletion(context: CompletionContext): CompletionResult | null {
  // \begin{ or \end{ → environment names
  const envMatch = context.matchBefore(/\\(?:begin|end)\{[\w*]*/);
  if (envMatch) {
    const braceAt = envMatch.text.indexOf("{");
    return {
      from: envMatch.from + braceAt + 1,
      options: ENVIRONMENTS.map((env) => ({
        label: env,
        apply: env + "}",
        type: "class",
        detail: "environment",
      })),
      filter: true,
    };
  }

  // \usepackage{ or \RequirePackage{ → package names
  const pkgMatch = context.matchBefore(/\\(?:usepackage|RequirePackage)\{[\w-]*/);
  if (pkgMatch) {
    const braceAt = pkgMatch.text.indexOf("{");
    return {
      from: pkgMatch.from + braceAt + 1,
      options: PACKAGES.map((pkg) => ({
        label: pkg,
        apply: pkg + "}",
        type: "namespace",
        detail: "package",
      })),
      filter: true,
    };
  }

  // \<word> → command names
  const cmdMatch = context.matchBefore(/\\\w*/);
  if (cmdMatch) {
    return {
      from: cmdMatch.from + 1, // keep the backslash, replace from the word
      options: COMMANDS.map((cmd) => ({
        label: cmd,
        type: "keyword",
      })),
      filter: true,
    };
  }

  return null;
}

// ── Theme ─────────────────────────────────────────────────────────────────────

const latexHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "#94a3b8", fontStyle: "italic" },
  { tag: tags.keyword, color: "#cc785c", fontWeight: "600" },
  { tag: tags.string, color: "#d97706" },
  { tag: tags.bracket, color: "#a9583e" },
]);

const latexTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    overflow: "auto",
  },
  ".cm-scroller::-webkit-scrollbar": { width: "6px", height: "6px" },
  ".cm-scroller::-webkit-scrollbar-track": { background: "transparent" },
  ".cm-scroller::-webkit-scrollbar-thumb": {
    background: "rgba(100,116,139,0.3)",
    borderRadius: "3px",
  },
  ".cm-scroller::-webkit-scrollbar-thumb:hover": {
    background: "rgba(100,116,139,0.5)",
  },
  ".cm-content": { padding: "24px", caretColor: "#cc785c", color: "#374151" },
  ".cm-line": { lineHeight: "1.625" },
  ".cm-gutters": {
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRight: "1px solid rgba(255,255,255,0.2)",
    color: "#64748b",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 12px 0 16px",
    minWidth: "3rem",
  },
  ".cm-activeLine": { backgroundColor: "rgba(204,120,92,0.06)" },
  ".cm-activeLineGutter": { backgroundColor: "rgba(204,120,92,0.08)" },
  ".cm-cursor": { borderLeftColor: "#cc785c" },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(204,120,92,0.16) !important",
  },
  ".cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(204,120,92,0.22) !important",
  },
  // Autocomplete dropdown
  ".cm-tooltip.cm-tooltip-autocomplete": {
    border: "1px solid rgba(204,120,92,0.22)",
    borderRadius: "10px",
    boxShadow: "0 8px 32px rgba(20,20,19,0.08), 0 2px 8px rgba(0,0,0,0.06)",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.95)",
    backdropFilter: "blur(12px)",
  },
  ".cm-tooltip-autocomplete > ul": {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: "13px",
    maxHeight: "240px",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    padding: "4px 12px",
    color: "#374151",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "rgba(204,120,92,0.14)",
    color: "#cc785c",
  },
  ".cm-completionMatchedText": {
    textDecoration: "none",
    fontWeight: "700",
    color: "#cc785c",
  },
  ".cm-completionDetail": {
    color: "#94a3b8",
    fontSize: "11px",
    marginLeft: "8px",
  },
});

// ── Tab keymap ────────────────────────────────────────────────────────────────

const tabKeymap = keymap.of([
  {
    key: "Tab",
    run: (view) => {
      view.dispatch(view.state.replaceSelection("  "));
      return true;
    },
  },
]);

// ── Export ────────────────────────────────────────────────────────────────────

export const latexExtensions: Extension[] = [
  latexParser,
  syntaxHighlighting(latexHighlight),
  latexTheme,
  tabKeymap,
  autocompletion({ override: [latexCompletion], defaultKeymap: true }),
];
