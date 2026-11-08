// The same curl without React: three plain <div>s become a postcard you can turn over.
import { createPageCurl } from '@pagecurl/core';

export function mountPostcard(element: HTMLElement): void {
  const curl = createPageCurl(element, { tapZone: 70 });
  const status = document.getElementById('postcard-status') as HTMLElement;
  const show = () => {
    status.textContent = `Side ${curl.page + 1} of ${curl.pageCount}`;
  };
  curl.setOptions({ onPageChange: show });
  show();

  document.getElementById('postcard-prev')?.addEventListener('click', () => curl.prev());
  document.getElementById('postcard-next')?.addEventListener('click', async () => {
    if (!(await curl.next())) curl.goTo(0);
  });

  let timer = 0;
  document.getElementById('postcard-auto')?.addEventListener('change', (e) => {
    clearInterval(timer);
    if (!(e.target as HTMLInputElement).checked) return;
    timer = window.setInterval(async () => {
      if (!(await curl.next())) curl.goTo(0);
    }, 1400);
  });
}
