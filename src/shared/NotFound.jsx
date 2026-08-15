// src/shared/NotFound.jsx — 404 amigable
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { BtnPrimary } from './Buttons.jsx';

export default function NotFound() {
  return (
    <div className="not-found">
      <div className="empty-state">
        <Compass size={48} />
        <h2>Página no encontrada</h2>
        <p>La dirección que buscás no existe o cambió. Revisá que esté bien escrita.</p>
        <Link to="/">
          <BtnPrimary>Ir al inicio</BtnPrimary>
        </Link>
      </div>
    </div>
  );
}
