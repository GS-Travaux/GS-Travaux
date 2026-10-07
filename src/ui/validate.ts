/* Validation des champs obligatoires (reprise du prototype) : tout élément [required] visible et vide
   est marqué .field-invalid ; renvoie false s'il en reste. */
import { toast } from './toast';

function isFieldVisible(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    if (node.style && node.style.display === 'none') return false;
    node = node.parentElement;
  }
  return true;
}

export function validateRequired(container: HTMLElement | null | undefined): boolean {
  const scope: ParentNode = container || document;
  const fields = Array.from(scope.querySelectorAll<HTMLInputElement>('[required]')).filter(isFieldVisible);
  let ok = true; let first: HTMLInputElement | null = null;
  fields.forEach(f => {
    let empty: boolean;
    if (f.type === 'file') empty = !(f.files && f.files.length);
    else if (f.type === 'checkbox' || f.type === 'radio') empty = false;
    else empty = (f.value || '').toString().trim() === '';
    f.classList.toggle('field-invalid', empty);
    if (empty) { ok = false; if (!first) first = f; }
  });
  if (!ok) { toast('Veuillez remplir tous les champs obligatoires.'); (first as HTMLInputElement | null)?.focus(); }
  return ok;
}
