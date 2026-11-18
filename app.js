// Área do CLIENTE — catálogo, carrinho, endereço, pagamento e acompanhamento
(function () {
  const { sb, $, esc, money, rpc, toast, busy, uid, STATUS, PGTO, REEMB, previsaoTxt, dt, dday } = AX;
  let cfg = null, cat = [], cart = {}, user = null, saved = [], entrega = null, idem = null, poll = null, tickT = null, cardForm = null;
  const PACK = 10;
  const FLOW = ['aguardando_pagamento', 'pagamento_confirmado', 'em_separacao', 'pronto_entrega', 'saiu_entrega', 'entregue'];

  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const stop = () => { clearInterval(poll); clearInterval(tickT); poll = tickT = null; cardForm = null; };
  const equiv = (n, u, un) => { const t = n * (u || PACK); un = un || 'espetinhos'; return t + ' ' + (t === 1 ? un.replace(/s$/, '') : un); };
  const cartEq = () => { const m = {}; cartItems().forEach((x) => { const k = x.p.unidade || 'espetinhos'; m[k] = (m[k] || 0) + x.q * (x.p.unidades_pacote || PACK); }); return Object.keys(m).map((k) => m[k] + ' ' + k).join(' + '); };
  const itEq = (i) => equiv(i.pacotes, i.unidades_pacote, i.unidade);
  const pk = (n) => n + ' pacote' + (n === 1 ? '' : 's');

  // ---------- carrinho ----------
  cart = ls.get('ax_cart') || {};
  const saveCart = () => ls.set('ax_cart', cart);
  const prodOf = (id) => cat.find((p) => p.id === id);
  const cartItems = () => Object.keys(cart).map((id) => ({ p: prodOf(id), q: cart[id] })).filter((x) => x.p && x.q > 0);
  const cartPacks = () => cartItems().reduce((s, x) => s + x.q, 0);
  const cartSub = () => cartItems().reduce((s, x) => s + x.q * Number(x.p.preco_pacote), 0);
  function setQty(id, q) {
    const p = prodOf(id); if (!p) return;
    q = Math.max(0, Math.min(q, p.disponivel));
    if (q === 0) delete cart[id]; else cart[id] = q;
    saveCart(); paintBar();
  }
  function paintBar(show) {
    const n = cartPacks();
    const bar = $('bar');
    if (show === false || n === 0) { bar.classList.add('hide'); return; }
    bar.classList.remove('hide');
    $('barQtd').textContent = pk(n) + ' (' + cartEq() + ')';
    $('barSub').textContent = 'Subtotal ' + money(cartSub());
  }
  async function loadCatalog() {
    cfg = await rpc('config_publica');
    cat = await rpc('catalogo');
    let mudou = false;
    Object.keys(cart).forEach((id) => {
      const p = prodOf(id);
      if (!p || p.disponivel <= 0) { delete cart[id]; mudou = true; }
      else if (cart[id] > p.disponivel) { cart[id] = p.disponivel; mudou = true; }
    });
    if (mudou) { saveCart(); toast('Ajustamos o carrinho conforme o estoque disponível.', 'err'); }
  }

  // ---------- sem conta: os pedidos ficam guardados neste aparelho (e no link do pedido) ----------
  const meusPares = () => ls.get('ax_pedidos') || [];
  const tokOf = (id) => (meusPares().find((x) => x.id === id) || {}).token;
  const guardar = (id, token) => { const L = meusPares().filter((x) => x.id !== id); L.unshift({ id, token }); ls.set('ax_pedidos', L.slice(0, 20)); paintAcct(); };
  const obterPed = (id) => rpc('obter_pedido_publico', { p_id: id, p_token: tokOf(id) });
  function paintAcct() { $('btnPedidos').classList.toggle('hide', !meusPares().length); }
  const needLogin = (fn) => fn();

  // ---------- navegação ----------
  async function go(v, arg) {
    stop(); $('modal').innerHTML = '';
    window.scrollTo(0, 0);
    try {
      if (v === 'loja') { await loadCatalog(); return viewLoja(); }
      if (v === 'carrinho') { await loadCatalog(); return viewCarrinho(); }
      if (v === 'checkout') { await loadCatalog(); return viewCheckout(); }
      if (v === 'pagar') return viewPagar(arg);
      if (v === 'pedidos') return viewPedidos();
    } catch (e) { $('view').innerHTML = '<div class="errbox">Não foi possível carregar: ' + esc(e.message) + '</div>'; }
  }

  // ---------- loja ----------
  function horariosTxt() {
    const h = cfg.horarios || {}, nomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const l = nomes.map((n, i) => h[i] && h[i].ativo ? n + ' ' + h[i].de + '–' + h[i].ate : null).filter(Boolean);
    return l.length ? l.join(' • ') : '';
  }
  function viewLoja() {
    paintBar(true);
    const ativo = cfg.regioes.length > 0 && horariosTxt();
    let h = '<div class="banner">🔥 1 pacote contém 10 espetinhos (o palito de bambu vem com 500). Todos os preços são por pacote.</div>';
    if (!ativo) h += '<div class="warn">A loja ainda está configurando as áreas e os horários de entrega. Você já pode conhecer os produtos.</div>';
    else h += '<div class="card small"><b>Entregamos em:</b> ' + cfg.regioes.map((r) => esc(r.nome || r.cidade) + ' (' + money(r.taxa) + ')').join(', ') + '<br><b>Dias e horários:</b> ' + esc(horariosTxt()) +
      (cfg.pedido_minimo > 0 ? '<br><b>Pedido mínimo:</b> ' + money(cfg.pedido_minimo) : '') + '</div>';
    if (cfg.desconto && cfg.desconto.ativo) h += '<div class="okbox">🎉 Compre ' + cfg.desconto.min_pacotes + ' pacotes ou mais e ganhe ' + cfg.desconto.percentual + '% de desconto nos produtos.</div>';
    if (!cat.length) h += '<div class="card mut">Nenhum produto disponível no momento.</div>';
    h += '<div class="grid">' + cat.map((p) => {
      const esg = p.disponivel <= 0, q = cart[p.id] || 0;
      return '<div class="card prod" data-id="' + p.id + '"><img src="' + esc(p.foto_url || 'logo.png') + '" alt="' + esc(p.nome) + '" loading="lazy">' +
        '<div class="b"><h3>' + esc(p.nome) + '</h3><div class="mut small">' + esc(p.descricao) + '</div>' +
        '<div class="price">' + money(p.preco_pacote) + ' <span class="small mut">/ pacote</span></div><div class="small mut">1 pacote = ' + (p.unidades_pacote || 10) + ' ' + esc(p.unidade || 'espetinhos') + '</div>' +
        (esg ? (p.sob_encomenda ? '<span class="tag warn">Só por encomenda</span><div class="small mut">Sem estoque pronto. Fale com a loja pelo WhatsApp para encomendar.</div>' : '<span class="tag bad">Esgotado</span>') :
          '<div id="ctl-' + p.id + '">' + ctlHtml(p) + '</div>') +
        '</div></div>';
    }).join('') + '</div>';
    $('view').innerHTML = h;
  }
  // botão "Comprar" (quando ainda não tem no carrinho) ou +/− (quando já tem)
  function ctlHtml(p) {
    const q = cart[p.id] || 0;
    if (!q) return '<button class="btn" data-act="mais" data-id="' + p.id + '">🛒 Comprar</button>' + (p.disponivel <= 5 ? '<div class="small mut" style="margin-top:6px">Últimos ' + p.disponivel + ' pacotes</div>' : '');
    return '<div class="stepper"><button data-act="menos" data-id="' + p.id + '">−</button><div><div class="q" id="q-' + p.id + '">' + q + '</div></div><button class="plus" data-act="mais" data-id="' + p.id + '">+</button></div>' +
      '<div class="small mut" id="e-' + p.id + '">' + pk(q) + ' no carrinho = ' + equiv(q, p.unidades_pacote, p.unidade) + '</div>';
  }
  function paintCard(id) { const p = prodOf(id), box = $('ctl-' + id); if (p && box) box.innerHTML = ctlHtml(p); }

  // ---------- carrinho ----------
  function viewCarrinho() {
    const it = cartItems();
    paintBar(false);
    if (!it.length) { $('view').innerHTML = '<h2>Seu carrinho</h2><div class="card mut">O carrinho está vazio.</div><button class="btn" data-act="loja">Ver produtos</button>'; return; }
    const sub = cartSub();
    let h = '<h2>Seu carrinho</h2><div class="banner">1 pacote contém 10 espetinhos (palito de bambu: 500)</div>';
    h += it.map((x) => '<div class="card"><div class="row"><div class="grow"><b>' + esc(x.p.nome) + '</b><div class="small mut">' + money(x.p.preco_pacote) + ' por pacote</div></div><b>' + money(x.q * x.p.preco_pacote) + '</b></div>' +
      '<div class="stepper" style="margin-top:8px"><button data-act="cmenos" data-id="' + x.p.id + '">−</button><div class="q">' + x.q + ' <span class="small mut">pacote' + (x.q > 1 ? 's' : '') + '</span><div class="small mut">= ' + equiv(x.q, x.p.unidades_pacote, x.p.unidade) + '</div></div>' +
      '<button class="plus" data-act="cmais" data-id="' + x.p.id + '">+</button></div>' +
      '<button class="btn sec sm" style="margin-top:8px" data-act="remover" data-id="' + x.p.id + '">Remover</button></div>').join('');
    const n = cartPacks();
    const d = cfg.desconto && cfg.desconto.ativo && n >= cfg.desconto.min_pacotes ? Math.round(sub * cfg.desconto.percentual) / 100 : 0;
    h += '<div class="card"><div class="sumline"><span>Subtotal (' + pk(n) + ' • ' + cartEq() + ')</span><b>' + money(sub) + '</b></div>' +
      (d ? '<div class="sumline"><span>Desconto</span><b>− ' + money(d) + '</b></div>' : '') +
      '<div class="small mut">A taxa de entrega e a previsão aparecem na próxima etapa, depois do endereço.</div></div>';
    if (cfg.pedido_minimo > 0 && sub < cfg.pedido_minimo) h += '<div class="warn">Pedido mínimo: ' + money(cfg.pedido_minimo) + '. Faltam ' + money(cfg.pedido_minimo - sub) + '.</div>';
    h += '<button class="btn" data-act="continuar">Continuar</button><button class="btn sec" style="margin-top:10px" data-act="loja">Adicionar mais produtos</button>';
    $('view').innerHTML = h;
  }

  // ---------- checkout ----------
  const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  async function viewCheckout() {
    paintBar(false);
    if (!cartItems().length) return go('carrinho');
    idem = idem || uid();
    const prof = { nome: '', telefone: '' };
    const f = ls.get('ax_form') || {};
    let h = '<h2>Entrega e dados</h2>';
    h += '<label>Nome completo</label><input id="fNome" autocomplete="name" value="' + esc(prof.nome || f.nome || '') + '">' +
      '<label>Telefone com WhatsApp</label><input id="fTel" type="tel" inputmode="tel" autocomplete="tel" placeholder="(31) 99999-9999" value="' + esc(prof.telefone || f.tel || '') + '">' +
      '<label>E-mail (para avisos do pedido)</label><input id="fEmail" type="email" inputmode="email" autocomplete="email" placeholder="voce@exemplo.com" value="' + esc(f.email || '') + '">' +
      '<label>CEP</label><input id="fCep" inputmode="numeric" maxlength="9" placeholder="00000-000" value="' + esc(f.cep || '') + '"><div class="small mut" id="cepMsg"></div>' +
      '<label>Rua</label><input id="fRua" value="' + esc(f.rua || '') + '">' +
      '<div class="cols"><div><label>Número</label><input id="fNum" value="' + esc(f.numero || '') + '"></div><div><label>&nbsp;</label><label class="row" style="margin:0;padding-top:12px"><input type="checkbox" id="fSn" style="width:24px;height:24px"> sem número</label></div></div>' +
      '<label>Complemento</label><input id="fComp" value="' + esc(f.complemento || '') + '">' +
      '<label>Bairro</label><input id="fBairro" value="' + esc(f.bairro || '') + '">' +
      '<div class="cols"><div><label>Cidade</label><input id="fCidade" value="' + esc(f.cidade || '') + '"></div><div><label>Estado</label><select id="fUf"><option value="">UF</option>' + UFS.map((u) => '<option' + (u === (f.estado || '') ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></div></div>' +
      '<label>Ponto de referência (opcional)</label><input id="fRef" value="' + esc(f.referencia || '') + '">' +
      '<label>Observações da entrega (opcional)</label><textarea id="fObs"></textarea>' +
      '<div id="entBox" class="card" style="margin-top:14px"></div><div id="chkErr"></div>' +
      '<button class="btn" id="btnPay" disabled>Ir para o pagamento</button><button class="btn sec" style="margin-top:10px" data-act="carrinho">Voltar ao carrinho</button>';
    $('view').innerHTML = h;
    wireCheckout(); calcEntrega();
  }
  const val = (id) => ($(id) ? $(id).value.trim() : '');
  const addrNow = () => ({ cep: val('fCep'), rua: val('fRua'), numero: $('fSn').checked ? 'sem número' : val('fNum'), complemento: val('fComp'), bairro: val('fBairro'), cidade: val('fCidade'), estado: val('fUf'), referencia: val('fRef') });
  function wireCheckout() {
    let t = null;
    const later = () => { clearTimeout(t); t = setTimeout(() => { remember(); calcEntrega(); }, 500); };
    ['fRua', 'fBairro', 'fCidade', 'fNum', 'fComp', 'fRef', 'fNome', 'fTel'].forEach((id) => $(id).addEventListener('input', later));
    $('fUf').addEventListener('change', later);
    $('fSn').addEventListener('change', () => { $('fNum').disabled = $('fSn').checked; if ($('fSn').checked) $('fNum').value = ''; later(); });
    if ($('fSaved')) $('fSaved').addEventListener('change', () => {
      const a = saved[Number($('fSaved').value)]; if (!a) return;
      $('fCep').value = a.cep || ''; $('fRua').value = a.rua || ''; $('fComp').value = a.complemento || ''; $('fBairro').value = a.bairro || '';
      $('fCidade').value = a.cidade || ''; $('fUf').value = a.estado || ''; $('fRef').value = a.referencia || '';
      $('fSn').checked = a.numero === 'sem número'; $('fNum').disabled = $('fSn').checked; $('fNum').value = $('fSn').checked ? '' : (a.numero || '');
      calcEntrega();
    });
    $('fCep').addEventListener('input', async () => {
      let d = $('fCep').value.replace(/\D/g, '').slice(0, 8);
      $('fCep').value = d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
      if (d.length !== 8) { $('cepMsg').textContent = ''; return; }
      $('cepMsg').textContent = 'Buscando endereço…';
      try {
        const r = await fetch('https://viacep.com.br/ws/' + d + '/json/'); const j = await r.json();
        if (j.erro) throw new Error('x');
        // preenche só o que o CEP informa; número e complemento ficam como estão
        if (j.logradouro) $('fRua').value = j.logradouro;
        if (j.bairro) $('fBairro').value = j.bairro;
        $('fCidade').value = j.localidade || $('fCidade').value; $('fUf').value = j.uf || $('fUf').value;
        $('cepMsg').textContent = 'Endereço encontrado. Confira e corrija se precisar.';
      } catch (e) { $('cepMsg').textContent = 'Não encontramos esse CEP. Preencha o endereço manualmente.'; }
      later();
    });
    $('btnPay').addEventListener('click', (ev) => busy(ev.target, submitOrder));
  }
  function remember() { const a = addrNow(); ls.set('ax_form', { ...a, nome: val('fNome'), tel: val('fTel'), email: val('fEmail') }); }
  async function calcEntrega() {
    const a = addrNow(), box = $('entBox'); if (!box) return;
    const sub = cartSub(), n = cartPacks();
    const d = cfg.desconto && cfg.desconto.ativo && n >= cfg.desconto.min_pacotes ? Math.round(sub * cfg.desconto.percentual) / 100 : 0;
    let h = '<div class="sumline"><span>Subtotal (' + pk(n) + ' • ' + cartEq() + ')</span><b>' + money(sub) + '</b></div>';
    entrega = null;
    if (!a.cidade || !a.bairro) {
      box.innerHTML = h + '<div class="small mut">Informe bairro e cidade para calcular a entrega.</div>'; $('btnPay').disabled = true; return;
    }
    try {
      const r = await rpc('calcular_entrega', { p_cidade: a.cidade, p_bairro: a.bairro });
      if (!r.ok) { box.innerHTML = h + '<div class="errbox" style="margin:8px 0 0">' + esc(r.motivo) + '</div>'; $('btnPay').disabled = true; return; }
      entrega = r;
      h += '<div class="sumline"><span>Entrega (' + esc(r.regiao || a.cidade) + ')</span><b>' + money(r.taxa) + '</b></div>' + (d ? '<div class="sumline"><span>Desconto</span><b>− ' + money(d) + '</b></div>' : '') +
        '<div class="sumline tot"><span>Total</span><span>' + money(sub + Number(r.taxa) - d) + '</span></div>' +
        '<div class="small mut" style="margin-top:6px">📅 Previsão: ' + esc(previsaoTxt(r.previsao)) + '</div>';
      if (cfg.pedido_minimo > 0 && sub < cfg.pedido_minimo) { h += '<div class="warn" style="margin-top:8px">Pedido mínimo: ' + money(cfg.pedido_minimo) + '.</div>'; $('btnPay').disabled = true; }
      else $('btnPay').disabled = false;
      box.innerHTML = h;
    } catch (e) { box.innerHTML = h + '<div class="errbox">' + esc(e.message) + '</div>'; $('btnPay').disabled = true; }
  }
  async function submitOrder() {
    const a = addrNow(), err = (m) => { $('chkErr').innerHTML = '<div class="errbox">' + esc(m) + '</div>'; window.scrollTo(0, document.body.scrollHeight); };
    $('chkErr').innerHTML = '';
    if (val('fNome').split(/\s+/).length < 2) return err('Digite seu nome completo.');
    if (val('fTel').replace(/\D/g, '').length < 10) return err('Digite um telefone com DDD (WhatsApp).');
    if (!/^\S+@\S+\.\S+$/.test(val('fEmail'))) return err('Digite um e-mail válido para os avisos do pedido.');
    if (a.cep.replace(/\D/g, '').length !== 8) return err('Digite o CEP.');
    if (!a.rua || !a.bairro || !a.cidade || !a.estado) return err('Complete rua, bairro, cidade e estado.');
    if (!a.numero) return err('Informe o número ou marque "sem número".');
    if (!entrega) return err('Confirme que atendemos o seu endereço.');
    try {
      const itens = cartItems().map((x) => ({ produto_id: x.p.id, pacotes: x.q }));
      const r = await rpc('criar_pedido_publico', { p_itens: itens, p_endereco: { ...a, email: val('fEmail') }, p_obs: val('fObs'), p_idem: idem, p_nome: val('fNome'), p_tel: val('fTel') });
      guardar(r.pedido_id, r.token);
      cart = {}; saveCart(); idem = null; paintBar(false);
      go('pagar', r.pedido_id);
    } catch (e) { err(e.message); }
  }

  // ---------- pagamento ----------
  const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function resumo(o) {
    const a = o.endereco || {};
    return '<div class="card"><h3>Pedido #' + o.numero + '</h3>' +
      o.itens.map((i) => '<div class="sumline"><span>' + pk(i.pacotes) + ' • ' + esc(i.nome) + ' <span class="mut small">(' + itEq(i) + ')</span></span><b>' + money(i.pacotes * i.preco_pacote) + '</b></div>').join('') +
      '<div class="sumline"><span>Subtotal</span><span>' + money(o.subtotal) + '</span></div>' +
      '<div class="sumline"><span>Entrega</span><span>' + money(o.taxa_entrega) + '</span></div>' +
      (Number(o.desconto) ? '<div class="sumline"><span>Desconto</span><span>− ' + money(o.desconto) + '</span></div>' : '') +
      '<div class="sumline tot"><span>Total</span><span>' + money(o.total) + '</span></div>' +
      '<div class="small mut" style="margin-top:8px">📍 ' + esc(a.rua + ', ' + a.numero + (a.complemento ? ' — ' + a.complemento : '') + ' — ' + a.bairro + ', ' + a.cidade + '/' + a.estado) + '<br>📅 Previsão: ' + esc(previsaoTxt(o.previsao)) + '</div></div>';
  }
  async function viewPagar(id) {
    paintBar(false);
    let o = await obterPed(id);
    if (!o) { $('view').innerHTML = '<div class="errbox">Pedido não encontrado.</div>'; return; }
    const sig = () => o.status + '|' + o.pgto_status;
    let shown = sig(), pixInfo = null;

    const paint = () => {
      stop(); $('modal').innerHTML = '';
      let h = '';
      if (o.status === 'cancelado') {
        $('view').innerHTML = '<div class="errbox">Este pedido foi cancelado.</div>' + resumo(o) + '<button class="btn" data-act="loja">Voltar à loja</button>'; return;
      }
      if (o.pgto_status === 'aprovado') {
        $('view').innerHTML = '<div class="okbox"><b>✅ Pagamento confirmado!</b><br>Recebemos o pagamento do pedido #' + o.numero + '. ' +
          (o.verificando ? 'Estamos conferindo alguns detalhes e entraremos em contato pelo WhatsApp.' : 'Você será avisado quando ele sair para entrega.') + '</div>' + resumo(o) +
          '<button class="btn" data-act="pedidos">Acompanhar meus pedidos</button><button class="btn sec" style="margin-top:10px" data-act="loja">Voltar à loja</button>';
        return;
      }
      const vivo = o.pgto_status === 'pendente' && o.reserva_expira && new Date(o.reserva_expira) > new Date();
      if (vivo && o.pgto_manual) {
        const mm = (cfg.pagamento && cfg.pagamento.manual) || {};
        let w = '<div class="okbox"><b>✅ Pedido #' + o.numero + ' recebido!</b><br>Forma de pagamento: <b>' + esc(o.forma_pagamento) + '</b>. A loja vai confirmar o pagamento e depois preparar o seu pedido.</div>' + resumo(o);
        if (/Pix/.test(o.forma_pagamento || '')) w += '<div class="card" style="text-align:center"><h3>Faça o Pix para a loja</h3><div class="small mut">Valor: <b>' + money(o.total) + '</b></div><div class="copia" id="pixCopia">' + esc(mm.pix_chave || '') + '</div>' + (mm.pix_nome ? '<div class="small mut">Titular: ' + esc(mm.pix_nome) + '</div>' : '') + '<button class="btn" id="btnCopy" style="margin-top:8px">Copiar chave Pix</button><div class="small mut" style="margin-top:8px">Depois de pagar, avise a loja pelo WhatsApp. O pedido aparece como pago assim que a loja confirmar.</div></div>';
        else w += '<div class="card">Tenha o valor de <b>' + money(o.total) + '</b> em mãos na hora da entrega.</div>';
        if (cfg.whatsapp) w += '<a class="btn sec" style="margin-bottom:10px" target="_blank" rel="noopener" href="https://wa.me/55' + esc(String(cfg.whatsapp).replace(/\D/g, '').replace(/^55/, '')) + '">Falar com a loja no WhatsApp</a>';
        w += '<button class="btn sec" id="btnTroca">Trocar forma de pagamento</button><button class="btn sec" style="margin-top:10px" data-act="pedidos">Ver meus pedidos</button>';
        $('view').innerHTML = w;
        if ($('btnCopy')) $('btnCopy').onclick = async () => { try { await navigator.clipboard.writeText($('pixCopia').textContent); toast('Chave Pix copiada!', 'ok'); } catch (e) { toast('Toque e segure a chave para copiar.'); } };
        $('btnTroca').onclick = () => { o.pgto_manual = false; paint(); };
        startPoll(); return;
      }
      if (!vivo) {
        const motivo = o.pgto_status === 'recusado' ? 'O pagamento foi recusado.' : 'O tempo para pagar acabou e a reserva dos pacotes foi liberada.';
        $('view').innerHTML = '<div class="errbox">' + motivo + ' Você pode tentar de novo: vamos reservar os pacotes outra vez, se ainda houver estoque.</div>' + resumo(o) +
          '<div id="payErr"></div><button class="btn" id="btnRetry">Tentar novamente</button><button class="btn sec" style="margin-top:10px" id="btnCancel">Cancelar pedido</button>';
        $('btnRetry').onclick = (ev) => busy(ev.target, async () => { try { await rpc('retentar_pagamento_publico', { p_pedido: id, p_token: tokOf(id) }); o = await obterPed(id); shown = sig(); pixInfo = null; paint(); } catch (e) { $('payErr').innerHTML = '<div class="errbox">' + esc(e.message) + '</div>'; } });
        $('btnCancel').onclick = (ev) => busy(ev.target, async () => { if (!confirm('Cancelar este pedido?')) return; try { await rpc('cancelar_pedido_publico', { p_pedido: id, p_token: tokOf(id) }); go('pedidos'); } catch (e) { toast(e.message, 'err'); } });
        startPoll(); return;
      }
      const pg = cfg.pagamento || {}, mm0 = pg.manual || {};
      h += '<h2>Pagamento</h2><div class="card" style="border-color:var(--o)"><b>⏱ Pacotes reservados por <span id="clock"></span></b><div class="small mut">Pague neste prazo para garantir o seu pedido.</div></div>' + resumo(o) + '<div id="payErr"></div>';
      const p0 = o.pagamento;
      if (pixInfo || (p0 && p0.metodo === 'pix' && p0.status === 'pendente' && p0.pix_copia)) {
        const px = pixInfo || { qr_base64: p0.pix_qr, copia: p0.pix_copia, expira: p0.pix_expira };
        h += '<div class="card" style="text-align:center"><h3>Pague com Pix</h3>' + (px.qr_base64 ? '<div class="qr"><img alt="QR Code Pix" src="data:image/png;base64,' + px.qr_base64 + '"></div>' : '') +
          '<div class="small mut" style="margin-top:8px">Abra o app do seu banco e escaneie, ou use o Pix copia e cola:</div><div class="copia" id="pixCopia">' + esc(px.copia) + '</div>' +
          '<button class="btn" id="btnCopy">Copiar código Pix</button><div class="small mut" style="margin-top:8px">Validade do Pix: ' + dt(px.expira) + '. A confirmação aparece aqui sozinha, assim que o banco avisar.</div></div>' +
          '<button class="btn sec" id="btnOutro">Escolher outra forma de pagamento</button>';
      } else {
        h += '<div class="card"><h3>Como você quer pagar?</h3>' +
          (pg.ativo && pg.pix ? '<button class="btn" id="btnPix" style="margin-bottom:10px">Pagar com Pix (automático)</button>' : '') +
          (pg.ativo && pg.cartao ? '<button class="btn sec" id="btnCartao" style="margin-bottom:10px">Pagar com cartão</button>' : '') +
          (mm0.ativo && mm0.pix_chave ? '<button class="btn" data-mf="pix" style="margin-bottom:10px">Pix direto para a loja</button>' : '') +
          (mm0.ativo && mm0.dinheiro ? '<button class="btn sec" data-mf="dinheiro" style="margin-bottom:10px">Dinheiro na entrega</button>' : '') +
          (mm0.ativo && mm0.maquininha ? '<button class="btn sec" data-mf="maquininha" style="margin-bottom:10px">Cartão na maquininha (na entrega)</button>' : '') + '<div id="cardBox"></div></div>';
      }
      h += '<button class="btn sec" style="margin-top:10px" data-act="pedidos">Ver meus pedidos</button>';
      $('view').innerHTML = h;
      const tick = () => { const left = new Date(o.reserva_expira) - new Date(); if ($('clock')) $('clock').textContent = fmtClock(left); if (left <= 0) { stop(); o.pgto_status = 'expirado'; paint(); } };
      tick(); tickT = setInterval(tick, 1000);
      if ($('btnCopy')) $('btnCopy').onclick = async () => { try { await navigator.clipboard.writeText($('pixCopia').textContent); toast('Código Pix copiado!', 'ok'); } catch (e) { toast('Toque e segure o código para copiar.'); } };
      if ($('btnOutro')) $('btnOutro').onclick = () => { pixInfo = null; o.pagamento = null; paint(); };
      if ($('btnPix')) $('btnPix').onclick = (ev) => busy(ev.target, async () => {
        try { const r = await callPagar({ pedido_id: id, metodo: 'pix' }); pixInfo = r.pix; if (!pixInfo) throw new Error('O Pix não foi gerado. Tente de novo.'); paint(); startPoll(); }
        catch (e) { $('payErr').innerHTML = '<div class="errbox">' + esc(e.message) + '</div>'; }
      });
      if ($('btnCartao')) $('btnCartao').onclick = () => openCard(id, o);
      document.querySelectorAll('[data-mf]').forEach((b) => { b.onclick = (ev) => busy(ev.target, async () => { try { await rpc('escolher_pagamento_manual', { p_pedido: id, p_token: tokOf(id), p_forma: b.dataset.mf }); o = await obterPed(id); paint(); } catch (e) { $('payErr').innerHTML = '<div class="errbox">' + esc(e.message) + '</div>'; } }); });
      startPoll();
    };
    function startPoll() {
      clearInterval(poll);
      poll = setInterval(async () => {
        try { const n = await obterPed(id); if (!n) return; const old = sig(); o = n; if (sig() !== old || (o.pagamento && !pixInfo && o.pagamento.pix_copia && !$('pixCopia'))) { shown = sig(); if (!cardForm) paint(); } } catch (e) { /* tenta de novo */ }
      }, 4000);
    }
    paint();
  }
  async function callPagar(body) {
    body.token = tokOf(body.pedido_id);
    let r;
    try {
      r = await fetch(AX.cfg.SUPABASE_URL + '/functions/v1/alex-pagar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AX.cfg.SUPABASE_ANON_KEY, apikey: AX.cfg.SUPABASE_ANON_KEY }, body: JSON.stringify(body) });
    } catch (e) { throw new Error('Sem conexão com o servidor de pagamento. Tente de novo.'); }
    let j = {}; try { j = await r.json(); } catch (e) { /* ignore */ }
    if (!r.ok) throw new Error(j.erro || (r.status === 404 ? 'O pagamento ainda não está disponível.' : 'Erro ao processar o pagamento.'));
    return j;
  }
  function loadMP() {
    return new Promise((res, rej) => {
      if (window.MercadoPago) return res();
      const s = document.createElement('script'); s.src = 'https://sdk.mercadopago.com/js/v2'; s.onload = res; s.onerror = () => rej(new Error('Não foi possível carregar o formulário do cartão.'));
      document.head.appendChild(s);
    });
  }
  async function openCard(id, o) {
    const box = $('cardBox'), pk0 = cfg.pagamento.public_key;
    if (!pk0) { box.innerHTML = '<div class="errbox">Cartão indisponível: a loja ainda não configurou a chave pública.</div>'; return; }
    box.innerHTML = '<form id="cf" style="margin-top:12px"><label>Número do cartão</label><div id="f-num" class="mpf"></div><div class="cols"><div><label>Validade</label><div id="f-exp" class="mpf"></div></div><div><label>CVV</label><div id="f-cvv" class="mpf"></div></div></div>' +
      '<label>Nome impresso no cartão</label><input id="f-nome"><label>Tipo de documento</label><select id="f-doctype"></select><label>Número do documento</label><input id="f-doc" inputmode="numeric">' +
      '<label>Banco emissor</label><select id="f-issuer"></select><label>Parcelas</label><select id="f-inst"></select><input type="hidden" id="f-email" value="' + esc(val('fEmail') || (ls.get('ax_form') || {}).email || '') + '">' +
      '<div id="cardErr"></div><button class="btn" id="cfBtn" type="submit" style="margin-top:14px">Pagar ' + money(o.total) + '</button></form>';
    const style = '.mpf{height:48px;background:#0c0705;border:1px solid #3a2518;border-radius:10px;padding:0 6px}';
    const st = document.createElement('style'); st.textContent = style; document.head.appendChild(st);
    try {
      await loadMP();
      const mp = new window.MercadoPago(pk0, { locale: 'pt-BR' });
      cardForm = mp.cardForm({
        amount: String(Number(o.total).toFixed(2)), iframe: true,
        form: {
          id: 'cf', cardNumber: { id: 'f-num', placeholder: 'Número do cartão' }, expirationDate: { id: 'f-exp', placeholder: 'MM/AA' }, securityCode: { id: 'f-cvv', placeholder: 'CVV' },
          cardholderName: { id: 'f-nome' }, issuer: { id: 'f-issuer' }, installments: { id: 'f-inst' }, identificationType: { id: 'f-doctype' }, identificationNumber: { id: 'f-doc' }, cardholderEmail: { id: 'f-email' },
        },
        callbacks: {
          onFormMounted: (e) => { if (e) $('cardErr').innerHTML = '<div class="errbox">Não foi possível montar o formulário do cartão.</div>'; },
          onSubmit: async (ev) => {
            ev.preventDefault(); const btn = $('cfBtn'); if (btn.disabled) return; btn.disabled = true; btn.textContent = 'Processando…';
            try {
              const d = cardForm.getCardFormData();
              if (!d.token) throw new Error('Confira os dados do cartão.');
              const r = await callPagar({ pedido_id: id, metodo: 'cartao', cartao: { token: d.token, payment_method_id: d.paymentMethodId, issuer_id: d.issuerId, installments: d.installments, identification: { type: d.identificationType, number: d.identificationNumber } } });
              if (r.status === 'approved') { toast('Pagamento aprovado!', 'ok'); const n = await obterPed(id); o.pgto_status = n.pgto_status; go('pagar', id); }
              else if (r.status === 'rejected') { $('cardErr').innerHTML = '<div class="errbox">Cartão recusado' + (r.detalhe ? ' (' + esc(r.detalhe) + ')' : '') + '. Use outro cartão ou escolha Pix.</div>'; setTimeout(() => go('pagar', id), 2500); }
              else { $('cardErr').innerHTML = '<div class="warn">Pagamento em análise. Esta tela atualiza quando houver resposta.</div>'; }
            } catch (e) { $('cardErr').innerHTML = '<div class="errbox">' + esc(e.message) + '</div>'; btn.disabled = false; btn.textContent = 'Pagar ' + money(o.total); }
          },
          onError: (e) => { const m = Array.isArray(e) ? e.map((x) => x.message).join(' ') : (e && e.message) || ''; if (m) $('cardErr').innerHTML = '<div class="errbox">' + esc(m) + '</div>'; },
        },
      });
    } catch (e) { box.innerHTML = '<div class="errbox">' + esc(e.message) + '</div>'; }
  }

  // ---------- meus pedidos ----------
  async function viewPedidos() {
    paintBar(false);
    const load = async () => {
      const list = await rpc('meus_pedidos_publico', { p_pares: meusPares() });
      let h = '<h2>Meus pedidos</h2>';
      if (!list.length) h += '<div class="card mut">Você ainda não fez pedidos.</div>';
      h += list.map((o) => {
        const idx = FLOW.indexOf(o.status), a = o.endereco || {};
        let acts = '';
        const vivo = o.pgto_status === 'pendente' && o.reserva_expira && new Date(o.reserva_expira) > new Date();
        if (o.status === 'aguardando_pagamento') acts = '<button class="btn sm" data-act="pagar" data-id="' + o.id + '">' + (vivo ? 'Pagar agora' : 'Tentar novamente') + '</button>';
        return '<div class="card order ' + (o.status === 'cancelado' ? 'cancelado' : o.status === 'entregue' ? 'entregue' : '') + '"><div class="row"><h3 class="grow">Pedido #' + o.numero + '</h3><span class="tag y">' + esc(STATUS[o.status]) + '</span></div>' +
          '<div class="small mut">' + dt(o.created_at) + ' • Pagamento: <b>' + esc(PGTO[o.pgto_status]) + '</b>' + (o.reembolso_status !== 'nao_solicitado' ? ' • ' + esc(REEMB[o.reembolso_status]) : '') + '</div>' +
          (o.status !== 'cancelado' ? '<div class="steps">' + FLOW.map((s, i) => '<i class="' + (i <= idx ? 'on' : '') + '"></i>').join('') + '</div>' : '') +
          o.itens.map((i) => '<div class="sumline small"><span>' + pk(i.pacotes) + ' • ' + esc(i.nome) + ' (' + itEq(i) + ')</span><span>' + money(i.pacotes * i.preco_pacote) + '</span></div>').join('') +
          '<div class="sumline tot"><span>Total</span><span>' + money(o.total) + '</span></div>' +
          '<div class="small mut">📍 ' + esc(a.rua + ', ' + a.numero + ' — ' + a.bairro) + '<br>📅 Previsão: ' + esc(previsaoTxt(o.previsao)) + '</div>' +
          (o.verificando ? '<div class="warn" style="margin-top:8px">Estamos conferindo seu pedido e vamos falar com você pelo WhatsApp.</div>' : '') +
          (o.pagamento && o.pagamento.metodo ? '<div class="small mut">Forma: ' + (o.pagamento.metodo === 'pix' ? 'Pix' : 'Cartão') + '</div>' : '') +
          (acts ? '<div style="margin-top:10px">' + acts + '</div>' : '') + '</div>';
      }).join('');
      if (cfg && cfg.whatsapp) h += '<a class="btn sec" style="margin-top:6px" target="_blank" rel="noopener" href="https://wa.me/55' + esc(String(cfg.whatsapp).replace(/\D/g, '').replace(/^55/, '')) + '">Falar com a loja no WhatsApp</a>';
      $('view').innerHTML = h;
    };
    if (!cfg) cfg = await rpc('config_publica');
    await load();
    poll = setInterval(() => load().catch(() => {}), 6000);
  }

  // ---------- eventos ----------
  $('view').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.dataset.id, a = b.dataset.act;
    if (a === 'mais') { setQty(id, (cart[id] || 0) + 1); paintCard(id); if ((cart[id] || 0) >= prodOf(id).disponivel) toast('Máximo disponível: ' + prodOf(id).disponivel + ' pacotes.'); }
    else if (a === 'menos') { setQty(id, (cart[id] || 0) - 1); paintCard(id); }
    else if (a === 'cmais') { setQty(id, (cart[id] || 0) + 1); viewCarrinho(); }
    else if (a === 'cmenos') { setQty(id, (cart[id] || 0) - 1); viewCarrinho(); }
    else if (a === 'remover') { setQty(id, 0); viewCarrinho(); }
    else if (a === 'loja') go('loja');
    else if (a === 'carrinho') go('carrinho');
    else if (a === 'pedidos') go('pedidos');
    else if (a === 'continuar') { if (cfg.pedido_minimo > 0 && cartSub() < cfg.pedido_minimo) return toast('Pedido mínimo: ' + money(cfg.pedido_minimo), 'err'); needLogin(() => go('checkout')); }
    else if (a === 'pagar') go('pagar', id);
  });
  $('barBtn').onclick = () => go('carrinho');
  $('btnLoja').onclick = () => go('loja');
  $('btnPedidos').onclick = () => needLogin(() => go('pedidos'));

  (async function boot() {
    if (!AX.configured) { $('view').innerHTML = '<div class="warn">O sistema ainda não foi conectado ao banco de dados (config.js).</div>'; return; }
    paintAcct();
    const q0 = new URLSearchParams(location.search), pp = q0.get('p'), tt = q0.get('t');
    if (pp && tt) { guardar(pp, tt); history.replaceState(null, '', location.pathname); return go('pagar', pp); }
    go('loja');
  })();
})();
