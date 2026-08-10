// src/modules/operator/CategoryRecordModal.jsx — modal para registrar 1 categoría
import { useEffect, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/client.js';
import Modal from '../../shared/Modal.jsx';
import { BtnPrimary, BtnGhost, BtnDanger } from '../../shared/Buttons.jsx';
import './CategoryRecordModal.css';

export default function CategoryRecordModal({ area, category, date, existing, onClose, onSaved }) {
  const [pounds, setPounds] = useState(existing ? String(existing.pounds) : '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setPounds(existing ? String(existing.pounds) : '');
  }, [existing]);

  async function save() {
    const value = Number(pounds);
    if (isNaN(value) || value < 0) {
      toast.error('Ingresá un número válido');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/records', {
        record_date: date,
        area_id: area.id,
        category_id: category.id,
        pounds: value,
      });
      toast.success(existing ? 'Actualizado' : 'Guardado');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing) return;
    if (!confirm(`¿Borrar el registro de ${category.name}?`)) return;
    setDeleting(true);
    try {
      await api.del(`/api/records/${existing.id}`);
      toast.success('Eliminado');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={category.name}
      footer={
        <>
          {existing && (
            <BtnDanger onClick={remove} disabled={deleting}>
              <Trash2 size={16} /> {deleting ? 'Borrando…' : 'Borrar'}
            </BtnDanger>
          )}
          <BtnGhost onClick={onClose}>Cancelar</BtnGhost>
          <BtnPrimary onClick={save} disabled={saving || pounds === ''}>
            <Save size={16} /> {saving ? 'Guardando…' : 'Guardar'}
          </BtnPrimary>
        </>
      }
    >
      <div className="crm" style={{ '--cat-color': category.color }}>
        <small className="crm-area">{area.name} · {date}</small>

        <div className="crm-input-wrap">
          <input
            type="text"
            inputMode="decimal"
            value={pounds}
            onChange={(e) => {
              const clean = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*?)\..*/g, '$1');
              setPounds(clean);
            }}
            placeholder="0"
            autoFocus
          />
          <span className="crm-unit">lb</span>
        </div>

        <div className="crm-presets">
          {[5, 10, 25, 50].map((v) => (
            <button key={v} type="button" className="crm-preset" onClick={() => setPounds(String(v))}>
              +{v}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
