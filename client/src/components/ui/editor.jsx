import React, { useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import { cn } from '@/lib/utils';

/**
 * Rich Text Editor Component
 *
 * TipTap-based editor for regulatory document authoring.
 * Replaces the previous textarea stub.
 */
export const Editor = ({
 value = '',
 onChange,
 placeholder = 'Write something...',
 className = '',
 readOnly = false,
}) => {
 const editor = useEditor({
 extensions: [
 StarterKit.configure({
 heading: { levels: [1, 2, 3] },
 }),
 Placeholder.configure({ placeholder }),
 Highlight,
 ],
 content: value,
 editable: !readOnly,
 onUpdate: ({ editor }) => {
 if (onChange) {
 onChange(editor.getHTML());
 }
 },
 });

 // Sync external value changes
 React.useEffect(() => {
 if (editor && value !== editor.getHTML()) {
 editor.commands.setContent(value, false);
 }
 }, [value, editor]);

 if (!editor) return null;

 return (
 <div className={cn('w-full h-full flex flex-col relative', className)}>
 {!readOnly && (
 <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-200 bg-zinc-50/50 flex-shrink-0">
 <button
 type="button"
 onClick={() => editor.chain().focus().toggleBold().run()}
 className={cn('p-1.5 rounded text-xs hover:bg-zinc-200', editor.isActive('bold') && 'bg-zinc-200 font-bold')}
 title="Bold"
 >B</button>
 <button
 type="button"
 onClick={() => editor.chain().focus().toggleItalic().run()}
 className={cn('p-1.5 rounded text-xs hover:bg-zinc-200 italic', editor.isActive('italic') && 'bg-zinc-200')}
 title="Italic"
 >I</button>
 <div className="w-px h-4 bg-zinc-200 mx-1" />
 <button
 type="button"
 onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
 className={cn('p-1.5 rounded text-xs hover:bg-zinc-200', editor.isActive('heading', { level: 1 }) && 'bg-zinc-200')}
 title="Heading 1"
 >H1</button>
 <button
 type="button"
 onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
 className={cn('p-1.5 rounded text-xs hover:bg-zinc-200', editor.isActive('heading', { level: 2 }) && 'bg-zinc-200')}
 title="Heading 2"
 >H2</button>
 <div className="w-px h-4 bg-zinc-200 mx-1" />
 <button
 type="button"
 onClick={() => editor.chain().focus().toggleBulletList().run()}
 className={cn('p-1.5 rounded text-xs hover:bg-zinc-200', editor.isActive('bulletList') && 'bg-zinc-200')}
 title="Bullet List"
 >&#8226;</button>
 <button
 type="button"
 onClick={() => editor.chain().focus().toggleOrderedList().run()}
 className={cn('p-1.5 rounded text-xs hover:bg-zinc-200', editor.isActive('orderedList') && 'bg-zinc-200')}
 title="Numbered List"
 >1.</button>
 </div>
 )}
 <EditorContent
 editor={editor}
 className={cn(
 'flex-1 overflow-y-auto prose prose-sm max-w-none p-3',
 'focus-within:ring-0 [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[200px]',
 readOnly ? 'cursor-default' : ''
 )}
 />
 </div>
 );
};

export default Editor;
