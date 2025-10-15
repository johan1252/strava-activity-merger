import React, { useState, useRef, useEffect } from 'react';
import { sportTypeToIcon } from '../utils/sportTypeToIcon';

export const sportTypes = [
  { label: 'All Sports', value: 'All' },
  { label: 'Ride', value: 'Ride' },
  { label: 'Run', value: 'Run' },
  { label: 'Walk', value: 'Walk' },
  { label: 'Hike', value: 'Hike' },
  { label: 'Swim', value: 'Swim' },
];

interface SportTypeDropdownProps {
  value: string;
  onChange: (value: string) => void;
}

const SportTypeDropdown: React.FC<SportTypeDropdownProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const selected = sportTypes.find(t => t.value === value) || sportTypes[0];

  return (
    <div ref={dropdownRef} style={{ position: 'relative', minWidth: 120 }}>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px 8px 12px',
          borderRadius: 8,
          border: '1.5px solid #FC4C02',
          background: '#fff',
          fontSize: 16,
          fontWeight: 500,
          color: '#222',
          cursor: 'pointer',
          boxShadow: open ? '0 2px 8px rgba(252,76,2,0.08)' : 'none',
          minWidth: 100,
          minHeight: 45,
          transition: 'box-shadow 0.2s',
        }}
      >
        <span style={{ fontSize: 20, display: 'flex', alignItems: 'center' }}>
          {sportTypeToIcon(selected.value)}
        </span>
        <span>{selected.label}</span>
        <span style={{ fontSize: 14, color: '#FC4C02' }}>▼</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            left: 0,
            background: '#fff',
            border: '1.5px solid #FC4C02',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            minWidth: 140,
            padding: '4px 0',
            zIndex: 1000,
          }}
          onClick={e => e.stopPropagation()}
        >
          {sportTypes.map(type => (
            <div
              key={type.value}
              onClick={() => { onChange(type.value); setOpen(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                cursor: 'pointer',
                background: value === type.value ? '#FFF3ED' : 'transparent',
                color: value === type.value ? '#FC4C02' : '#222',
                fontWeight: value === type.value ? 600 : 400,
                fontSize: 15,
                border: 'none',
                outline: 'none',
                transition: 'background 0.15s',
              }}
              onMouseDown={e => e.preventDefault()}
            >
              <span style={{ fontSize: 20, display: 'flex', alignItems: 'center' }}>
                {sportTypeToIcon(type.value)}
              </span>
              <span>{type.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SportTypeDropdown;
