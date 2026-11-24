import { startApplication } from './lib/application.js';

const blocker = document.querySelector('#startup');
blocker.addEventListener('cancel', event => event.preventDefault());
const message = blocker.querySelector('p');
async function start() {
  if (!navigator.locks) throw new Error('Open the desk on localhost or HTTPS in a browser with Web Locks support.');
  await navigator.locks.request('rental-desk-editor-v1', { ifAvailable: true }, async lock => {
    if (!lock) {
      message.textContent = 'The desk is open in another tab. Close that tab, then reload here to edit.';
      blocker.showModal();
      return;
    }
    await startApplication();
    await new Promise(resolve => window.addEventListener('pagehide', resolve, { once: true }));
  });
}
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
start().catch(error => { message.textContent = error.message; if (!blocker.open) blocker.showModal(); });
