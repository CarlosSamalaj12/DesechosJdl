// src/shared/ChangePasswordModal.jsx
import { useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/client.js';
import Modal from './Modal.jsx';
import { BtnPrimary, BtnGhost } from './Buttons.jsx';

export default function ChangePasswordModal({ open, onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function close() {
    setCurrent(''); setNext(''); setConfirm(''); setErr(null);
    onClose();
  }

  async function save() {
    setErr(null);
    if (next.length < 4) {
      setErr('La nueva contraseña debe tener al menos 4 caracteres');
      return;
    }
    if (next !== confirm) {
      setErr('La confirmación no coincide');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/auth/change-password', {
        current_password: current,
        new_password: next,
      });
      toast.success('Contraseña actualizada');
      close();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Cambiar contraseña"
      footer={
        <>
          <BtnGhost onClick={close}>Cancelar</BtnGhost>
          <BtnPrimary onClick={save} disabled={saving || !current || !next || !confirm}>
            <Save size={16} /> {saving ? 'Guardando…' : 'Cambiar'}
          </BtnPrimary>
        </>
      }
    >
      <div className="form-grid">
        {err && (
          <div className="login-error">
            <span>{err}</span>
          </div>
        )}
        <label className="field">
          <span>Contraseña actual</span>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            autoFocus
          />
        </label>
        <label className="field">
          <span>Nueva contraseña</span>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="field">
          <span>Confirmar nueva</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </label>
      </div>
    </Modal>
  );
}
