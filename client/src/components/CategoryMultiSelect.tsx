import { useMemo, useState } from "react";

type CategoryNode = {
  id: string;
  name: string;
  parentId?: string;
  children?: CategoryNode[];
  aliases?: string[];
};

type Props = {
  tree: CategoryNode[];
  value: string[];
  onChange: (ids: string[]) => void;
  allowPartial?: boolean;
  searchable?: boolean;
};

export default function CategoryMultiSelect({
  tree, value, onChange, allowPartial = false, searchable = true
}: Props) {
  const [query, setQuery] = useState("");

  const matches = (n: CategoryNode) =>
    !query ||
    n.name.toLowerCase().includes(query.toLowerCase()) ||
    (n.aliases || []).some(a => a.toLowerCase().includes(query.toLowerCase()));

  const toggle = (id: string, children?: string[]) => {
    const set = new Set(value);
    if (set.has(id)) set.delete(id); else set.add(id);
    // optional: cascade to children
    (children || []).forEach(cid => set[set.has(id) ? "add" : "delete"](cid));
    onChange([...set]);
  };

  const renderNode = (n: CategoryNode) => {
    const childIds = flattenIds(n);
    const allSelected = childIds.every(id => value.includes(id));
    const anySelected = childIds.some(id => value.includes(id));
    const indeterminate = allowPartial && anySelected && !allSelected;

    return (
      <div key={n.id} className="cat-node">
        <label className="cat-row flex items-center gap-2 p-2 hover:bg-stone-100 rounded cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = indeterminate; }}
            onChange={() => toggle(n.id, n.children?.map(c => c.id))}
            className="cursor-pointer"
            data-testid={`checkbox-category-${n.id}`}
          />
          <span className={n.children?.length ? 'font-semibold' : ''}>{n.name}</span>
          {n.aliases && n.aliases.length > 0 && (
            <span className="text-xs text-stone-400">({n.aliases.join(', ')})</span>
          )}
        </label>
        {n.children?.length ? (
          <div className="cat-children ml-6">
            {n.children.filter(matches).map(renderNode)}
          </div>
        ) : null}
      </div>
    );
  };

  const filtered = useMemo(
    () => tree.filter(matches),
    [tree, query]
  );

  return (
    <div className="cat-multiselect border rounded-lg p-3 bg-stone-50">
      {searchable && (
        <input
          placeholder="Search categories…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="search w-full px-3 py-2 border rounded-md mb-3"
          data-testid="input-search-categories"
        />
      )}
      <div className="cat-tree max-h-[300px] overflow-y-auto">
        {filtered.map(renderNode)}
      </div>
      {value.length > 0 && (
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs text-stone-500 mb-2">Selected ({value.length}):</p>
          <div className="flex flex-wrap gap-1">
            {value.map(id => {
              const cat = findCategoryById(tree, id);
              return cat ? (
                <span key={id} className="inline-flex items-center gap-1 px-2 py-1 bg-stone-100 text-stone-800 text-xs rounded">
                  {cat.name}
                </span>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// helpers
function flattenIds(n: CategoryNode): string[] {
  return [n.id, ...(n.children?.flatMap(flattenIds) || [])];
}

function findCategoryById(tree: CategoryNode[], id: string): CategoryNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findCategoryById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}
