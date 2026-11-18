// Biblioteca comum (cliente, equipe e administrador)
(function () {
  const cfg = window.AX_CONFIG || {};
  const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const sb = configured ? supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { db: { schema: 'alex' } }) : null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const pad = (n) => String(n).padStart(2, '0');
  const dt = (s) => { if (!s) return '—'; const d = new Date(s); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const dday = (s) => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return d + '/' + m + '/' + y; };
  const hhmm = (s) => String(s || '').slice(11, 16);
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const previsaoTxt = (p) => {
    if (!p || !p.de) return '—';
    const d = new Date(p.de.slice(0, 10) + 'T12:00:00');
    return DIAS[d.getDay()] + ', ' + dday(p.de) + ', entre ' + hhmm(p.de) + ' e ' + hhmm(p.ate);
  };
  const STATUS = {
    aguardando_pagamento: 'Aguardando pagamento', pagamento_confirmado: 'Pagamento confirmado', em_separacao: 'Em separação',
    pronto_entrega: 'Pronto para entrega', saiu_entrega: 'Saiu para entrega', entregue: 'Entregue', cancelado: 'Cancelado',
  };
  const PGTO = { pendente: 'Pendente', aprovado: 'Pago', recusado: 'Recusado', expirado: 'Expirado' };
  const REEMB = { nao_solicitado: 'Não solicitado', pendente: 'Reembolso pendente', concluido: 'Reembolso concluído', negado: 'Reembolso negado' };

  async function rpc(fn, args) {
    const { data, error } = await sb.rpc(fn, args || {});
    if (error) throw new Error(error.message);
    return data;
  }
  async function q(promise) { const { data, error } = await promise; if (error) throw new Error(error.message); return data; }

  function toast(msg, tipo) {
    let box = $('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + (tipo || ''); t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.remove(), tipo === 'err' ? 6000 : 3500);
  }
  let actx;
  // o navegador só libera o som depois de um toque do usuário
  document.addEventListener('click', () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { /* sem áudio */ } }, { once: true });
  function beep() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      [0, 0.25, 0.5].forEach((d) => {
        const o = actx.createOscillator(), g = actx.createGain(); o.connect(g); g.connect(actx.destination);
        o.frequency.value = 880; g.gain.setValueAtTime(0.25, actx.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + d + 0.2);
        o.start(actx.currentTime + d); o.stop(actx.currentTime + d + 0.22);
      });
    } catch (e) { /* sem áudio */ }
  }
  // Login por NOME + senha: o Supabase exige um e-mail, então usamos um endereço interno derivado do nome.
  const DOMINIO = 'usuarios.espetinhosalex.app';
  const slug = (n) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  const userEmail = (n) => { const u = slug(n); if (u.length < 3) throw new Error('Digite seu nome (pelo menos 3 letras).'); return u + '@' + DOMINIO; };
  const userName = (e) => String(e || '').replace('@' + DOMINIO, '');
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
  // evita toque duplo: bloqueia o botão enquanto a ação roda
  async function busy(btn, fn) {
    if (btn.disabled) return;
    btn.disabled = true; const old = btn.textContent; btn.dataset.old = old;
    try { return await fn(); } finally { btn.disabled = false; btn.textContent = old; }
  }
  window.AX = { userEmail, userName, configured, sb, cfg, $, esc, money, dt, dday, hhmm, previsaoTxt, STATUS, PGTO, REEMB, rpc, q, toast, beep, uid, busy, DIAS };
})();
