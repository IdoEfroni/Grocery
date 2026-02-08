import { Modal as BSModal, Button } from 'react-bootstrap';

export default function Modal({ children, onClose, title }) {
  return (
    <BSModal show onHide={onClose} centered backdrop="static">
      <BSModal.Header closeButton className="bg-dark text-light border-secondary">
        {title ? <BSModal.Title>{title}</BSModal.Title> : null}
      </BSModal.Header>
      <BSModal.Body className="bg-dark text-light">{children}</BSModal.Body>
    </BSModal>
  );
}
