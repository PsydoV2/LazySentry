// Inline "+ Add section" affordance for the dashboard — a quiet text button
// that turns into a name field + confirm, the same reveal-a-form-in-place
// pattern Settings uses for "Add account" (no modal for something this
// small, per docs/CONCEPT.md 8.0 "reduced chrome").

import { useState } from 'react';
import { IconPlus } from './icons';

export function AddSectionRow({ onCreate }: { onCreate: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  if (!editing) {
    return (
      <button
        type="button"
        className="btn-quiet add-section-btn"
        onClick={() => setEditing(true)}
      >
        <IconPlus /> Add section
      </button>
    );
  }

  const cancel = () => {
    setName('');
    setEditing(false);
  };

  return (
    <form
      className="add-section-form"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        onCreate(trimmed);
        setName('');
        setEditing(false);
      }}
    >
      <input
        type="text"
        autoFocus
        placeholder="Section name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') cancel();
        }}
      />
      <button type="submit" className="btn-primary" disabled={!name.trim()}>
        Add
      </button>
      <button type="button" className="btn-secondary" onClick={cancel}>
        Cancel
      </button>
    </form>
  );
}
