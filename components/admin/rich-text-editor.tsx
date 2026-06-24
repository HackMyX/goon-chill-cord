"use client";

import { useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import { Underline } from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
import { TextAlign } from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extension-placeholder";
import { FontFamily } from "@tiptap/extension-font-family";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote, Code2,
  Minus, AlignLeft, AlignCenter, AlignRight, Link2, Link2Off,
  Palette, Highlighter, Eraser, Undo2, Redo2,
} from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";

const TEXT_COLOR_SWATCHES = [
  "#f4f4f5", "#a855f7", "#3b82f6", "#06b6d4", "#22c55e",
  "#eab308", "#f97316", "#ef4444", "#ec4899", "#ffffff",
];
const HIGHLIGHT_SWATCHES = [
  "#a855f7", "#3b82f6", "#06b6d4", "#22c55e", "#eab308", "#f97316", "#ef4444", "#ec4899",
];

function ToolbarButton({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const sound = useSoundManager();
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseEnter={sound.hover}
      onClick={() => { sound.click(); onClick(); }}
      className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:opacity-30 ${
        active
          ? "border-purple-400/60 bg-purple-500/25 text-purple-200"
          : "border-transparent text-zinc-400 hover:border-white/15 hover:bg-white/8 hover:text-zinc-100"
      }`}
    >
      {children}
    </button>
  );
}

function ColorSwatchPopover({
  swatches,
  onPick,
  onPickCustom,
  icon,
  title,
  active,
}: {
  swatches: string[];
  onPick: (color: string) => void;
  onPickCustom: (color: string) => void;
  icon: React.ReactNode;
  title: string;
  active?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sound = useSoundManager();
  return (
    <div className="group/colorpop relative">
      <ToolbarButton title={title} active={active} onClick={() => {}}>
        {icon}
      </ToolbarButton>
      <div className="invisible absolute left-0 top-full z-50 mt-1 flex flex-col gap-2 rounded-xl border border-white/10 bg-[#15131f] p-2.5 opacity-0 shadow-xl transition-opacity group-hover/colorpop:visible group-hover/colorpop:opacity-100">
        <div className="grid grid-cols-5 gap-1.5">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onMouseEnter={sound.hover}
              onClick={() => { sound.click(); onPick(c); }}
              className="h-5 w-5 rounded-full border border-white/15 transition-transform hover:scale-110"
              style={{ background: c }}
            />
          ))}
        </div>
        <button
          type="button"
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); inputRef.current?.click(); }}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-white/10"
        >
          <Palette className="h-3 w-3" />
          Volle Farbauswahl (RGB)
        </button>
        <input
          ref={inputRef}
          type="color"
          className="h-0 w-0 opacity-0"
          onChange={(e) => onPickCustom(e.target.value)}
        />
      </div>
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false }),
      TextStyle,
      Color,
      Underline,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: placeholder ?? "Patch Note Text hier einfügen oder schreiben…" }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "patchnote-richtext patchnote-richtext-editable focus:outline-none min-h-[220px] px-4 py-3 text-sm text-zinc-200",
      },
    },
  });

  if (!editor) {
    return (
      <div className="min-h-[260px] rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-600">
        Editor lädt…
      </div>
    );
  }

  function setLink() {
    const previous = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link-URL:", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-white/8 bg-black/40 p-2">
        <ToolbarButton title="Fett" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Kursiv" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Unterstrichen" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Durchgestrichen" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-white/10" />

        <ToolbarButton title="Überschrift 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Überschrift 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Überschrift 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-white/10" />

        <ToolbarButton title="Aufzählung" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Nummerierte Liste" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Zitat" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Code" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <Code2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Trennlinie" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-white/10" />

        <ToolbarButton title="Linksbündig" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Zentriert" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Rechtsbündig" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-white/10" />

        <ColorSwatchPopover
          title="Textfarbe (volles RGB)"
          icon={<Palette className="h-3.5 w-3.5" />}
          active={editor.isActive("textStyle", { color: /.*/ })}
          swatches={TEXT_COLOR_SWATCHES}
          onPick={(c) => editor.chain().focus().setColor(c).run()}
          onPickCustom={(c) => editor.chain().focus().setColor(c).run()}
        />
        <ColorSwatchPopover
          title="Hintergrund-Markierung (volles RGB)"
          icon={<Highlighter className="h-3.5 w-3.5" />}
          active={editor.isActive("highlight")}
          swatches={HIGHLIGHT_SWATCHES}
          onPick={(c) => editor.chain().focus().toggleHighlight({ color: c }).run()}
          onPickCustom={(c) => editor.chain().focus().toggleHighlight({ color: c }).run()}
        />

        <span className="mx-1 h-5 w-px bg-white/10" />

        <ToolbarButton title="Link einfügen" active={editor.isActive("link")} onClick={setLink}>
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Link entfernen" disabled={!editor.isActive("link")} onClick={() => editor.chain().focus().unsetLink().run()}>
          <Link2Off className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Formatierung löschen" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
          <Eraser className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-white/10" />

        <ToolbarButton title="Rückgängig" onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Wiederholen" onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
