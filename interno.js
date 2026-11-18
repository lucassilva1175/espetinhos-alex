// Áreas INTERNAS: funcionária (equipe.html) e administrador (admin.html)
(function () {
  const { sb, $, esc, money, dt, dday, rpc, q, toast, beep, uid, busy, STATUS, PGTO, REEMB, previsaoTxt, DIAS } = AX;
  const AREA = document.body.dataset.area;
  let me = null, tab = null, names = {}, products = [], ORD = [], RES = [], known = null, rtch = null, bgT = null, pollWait = null;
  let knownM = null, prodIdem = null, cfgCache = null, ordFilter = 'pend', ordSearch = '', ordDay = new Date().toLocaleDateString('sv-SE');
  const ldate = (iso) => (iso ? new Date(iso).toLocaleDateString('sv-SE') : '');
  const isAdmin = () => me && me.role === 'admin';
  const todayStr = () => new Date().toLocaleDateString('sv-SE');
  const nm = (id) => (id && names[id]) || '—';
  const pk = (n) => n + ' pacote' + (n === 1 ? '' : 's');
  const eq = (n, u) => n * ((u && u.unidades_pacote) || 10) + ' ' + ((u && u.unidade) || 'espetinhos');
  const eqSum = (its) => { const m = {}; its.forEach((i) => { const k = i.unidade || 'espetinhos'; m[k] = (m[k] || 0) + i.pacotes * (i.unidades_pacote || 10); }); return Object.keys(m).map((k) => m[k] + ' ' + k).join(' + ') || '0'; };

  // ---------- janelas ----------
  function modal(html) { $('modal').innerHTML = '<div class="modal"><div class="box">' + html + '</div></div>'; }
  const closeModal = () => { $('modal').innerHTML = ''; };
  function confirmBox(html, okText) {
    return new Promise((res) => {
      modal(html + '<div class="row" style="margin-top:14px"><button class="btn sec grow" id="cbNo">Voltar</button><button class="btn grow" id="cbOk">' + esc(okText || 'Confirmar') + '</button></div>');
      $('cbNo').onclick = () => { closeModal(); res(false); };
      $('cbOk').onclick = () => { closeModal(); res(true); };
    });
  }
  const act = (fn) => async (ev) => { const b = ev.currentTarget || ev.target; return busy(b, async () => { try { await fn(); } catch (e) { toast(e.message, 'err'); } }); };

  // ---------- entrada ----------
  function loginView(msg) {
    $('tabs').classList.add('hide'); $('btnSair').classList.add('hide'); $('btnSenha').classList.add('hide'); $('who').textContent = '';
    $('view').innerHTML = '<h2>' + (AREA === 'admin' ? 'Acesso do administrador' : 'Acesso da equipe') + '</h2>' +
      (AREA === 'equipe' ? '<p class="mut">Cada pessoa usa o seu próprio login. Se é o seu primeiro acesso, toque em "Criar meu acesso" e aguarde o Alexandre liberar.</p>' : '') +
      (msg ? '<div class="errbox">' + esc(msg) + '</div>' : '') +
      '<label>Seu nome (é com ele que você entra)</label><input id="lEmail" autocomplete="username" placeholder="Ex.: Ana"><label>Senha (mínimo 6 caracteres)</label><input id="lPass" type="password" autocomplete="current-password">' +
      '<div id="lErr"></div>' +
      '<button class="btn" id="lIn" style="margin-top:14px">Entrar</button><button class="btn sec" id="lUp" style="margin-top:10px">Criar meu acesso</button>';
    const err = (m) => { $('lErr').innerHTML = '<div class="errbox">' + esc(m) + '</div>'; };
    const cred = () => { const nome = $('lEmail').value.trim(), p = $('lPass').value, e = AX.userEmail(nome); if (p.length < 6) throw new Error('A senha precisa de pelo menos 6 caracteres.'); return [e, p, nome]; };
    $('lIn').onclick = act(async () => {
      try { const [e, p] = cred(); const { error } = await sb.auth.signInWithPassword({ email: e, password: p }); if (error) throw new Error(/Invalid login/i.test(error.message) ? 'Nome ou senha incorretos.' : error.message); afterLogin(); } catch (x) { err(x.message); }
    });
    $('lUp').onclick = act(async () => {
      try {
        const [e, p, nome] = cred();
        const { data, error } = await sb.auth.signUp({ email: e, password: p, options: { data: { nome } } });
        if (error) throw new Error(/already|registered/i.test(error.message) ? 'Já existe alguém com esse nome. Se é você, toque em "Entrar"; se não, acrescente o sobrenome.' : error.message);
        if (!data.session) throw new Error('Conta criada. Confirme pelo e-mail e depois toque em "Entrar".');
        await rpc('solicitar_equipe', { p_nome: nome }); afterLogin();
      } catch (x) { err(x.message); }
    });
  }
  async function afterLogin() {
    clearInterval(pollWait);
    try { me = await rpc('meu_perfil'); } catch (e) { return loginView(e.message); }
    $('who').textContent = me.nome || AX.userName(me.email); $('btnSair').classList.remove('hide'); $('btnSenha').classList.remove('hide');
    if (me.role === 'admin' || (me.role === 'funcionaria' && AREA === 'equipe')) return start();
    if (me.role === 'funcionaria') { $('view').innerHTML = '<div class="warn">Esta área é só do administrador. <a href="equipe.html" style="color:var(--y)">Ir para a área da equipe</a></div>'; return; }
    if (me.role === 'bloqueado') { $('view').innerHTML = '<div class="errbox">Acesso bloqueado. Fale com o Alexandre.</div>'; return; }
    if (me.role === 'pendente_equipe') {
      $('view').innerHTML = '<div class="card" style="text-align:center"><h2>⏳ Aguardando liberação</h2><p class="mut">O Alexandre precisa aceitar o seu acesso. Esta tela atualiza sozinha.</p></div>';
      pollWait = setInterval(afterLogin, 8000); return;
    }
    if (AREA === 'admin') { $('view').innerHTML = '<div class="errbox">Esta conta não é de administrador.</div>'; return; }
    $('view').innerHTML = '<div class="card"><h2>Pedir acesso da equipe</h2><p class="mut">Esta conta ainda não é da equipe.</p><label>Seu nome</label><input id="rNome" value="' + esc(me.nome || '') + '"><button class="btn" id="rBtn" style="margin-top:12px">Pedir acesso</button></div>';
    $('rBtn').onclick = act(async () => { await rpc('solicitar_equipe', { p_nome: $('rNome').value.trim() }); afterLogin(); });
  }
  $('btnSenha').onclick = () => senhaModal(null);
  $('btnSair').onclick = async () => { stopAll(); await sb.auth.signOut(); location.reload(); };

  // ---------- estrutura ----------
  const TABS_EQ = [['inicio', '🏠 Início'], ['pedidos', '📦 Pedidos'], ['producao', '➕ Produzir'], ['estoque', '❄️ Câmara fria'], ['salario', '💵 Salário']];
  const TABS_AD = [['inicio', '🏠 Início'], ['pedidos', '📦 Fila'], ['todos', '🧾 Todos os pedidos'], ['estoque', '❄️ Câmara fria'], ['produtos', '🍢 Produtos'], ['equipe', '👥 Equipe'], ['usuarios', '🔑 Senhas'], ['folha', '👩‍🍳 Folha'], ['financeiro', '💰 Financeiro'], ['lucro', '📈 Lucro por produto'], ['entrega', '🚚 Entrega'], ['pagto', '💳 Pagamentos'], ['relat', '📊 Relatórios']];
  async function start() {
    const list = AREA === 'admin' ? TABS_AD : TABS_EQ;
    $('tabs').classList.remove('hide');
    $('tabs').innerHTML = list.map(([k, l]) => '<button class="pill" data-tab="' + k + '">' + l + ' <span class="tag y hide" id="bd-' + k + '"></span></button>').join('');
    $('tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); };
    try { const ps = await q(sb.from('profiles').select('id,nome,email')); ps.forEach((p) => { names[p.id] = p.nome || p.email; }); } catch (e) { /* ignore */ }
    await refreshOrders(true);
    realtime();
    go('inicio');
  }
  function stopAll() { if (rtch) sb.removeChannel(rtch); clearInterval(bgT); clearInterval(pollWait); }
  function realtime() {
    rtch = sb.channel('ax-int')
      .on('postgres_changes', { event: '*', schema: 'alex', table: 'pedidos' }, () => refreshOrders())
      .on('postgres_changes', { event: '*', schema: 'alex', table: 'lotes' }, () => { if (tab === 'estoque' || tab === 'inicio') go(tab, true); })
      .subscribe();
    bgT = setInterval(() => refreshOrders(), 20000);   // rede de segurança
  }
  async function go(t, silent) {
    tab = t;
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    if (!silent) window.scrollTo(0, 0);
    try {
      const fn = { inicio: tInicio, pedidos: tPedidos, producao: tProducao, estoque: tEstoque, todos: tTodos, produtos: tProdutos, equipe: tEquipe, usuarios: tUsuarios, salario: tSalario, folha: tFolha, financeiro: tFinanceiro, lucro: tLucro, entrega: tEntrega, pagto: tPagto, relat: tRelat }[t];
      await fn();
    } catch (e) { $('view').innerHTML = '<div class="errbox">' + esc(e.message) + '</div>'; }
  }

  // ---------- pedidos (fila) + avisos ----------
  async function refreshOrders(first) {
    try {
      ORD = await q(sb.from('pedidos').select('*, itens_pedido(*)').in('status', ['pagamento_confirmado', 'em_separacao', 'pronto_entrega', 'saiu_entrega']).eq('pgto_status', 'aprovado').eq('excecao', false).order('pago_em', { ascending: true }));
      const ids = ORD.map((o) => o.id);
      RES = ids.length ? await q(sb.from('reservas').select('pedido_id,qtd,lotes(codigo,validade,produtos(nome))').in('pedido_id', ids).eq('status', 'confirmada')) : [];
    } catch (e) { return; }
    if (isAdmin() && AREA === 'admin') {   // pedidos esperando o Alexandre confirmar o pagamento direto (Pix/dinheiro/maquininha)
      try {
        const mp = await q(sb.from('pedidos').select('id,numero,cliente_nome,forma_pagamento').eq('pgto_manual', true).eq('status', 'aguardando_pagamento').eq('pgto_status', 'pendente'));
        const novosM = mp.filter((x) => knownM && !knownM.has(x.id));
        knownM = new Set(mp.map((x) => x.id));
        const bdt = $('bd-todos'); if (bdt) { bdt.textContent = mp.length; bdt.classList.toggle('hide', !mp.length); }
        if (novosM.length && !first) { beep(); novosM.forEach((x) => toast('💵 Pedido #' + x.numero + ' (' + x.cliente_nome + ') aguarda confirmação: ' + x.forma_pagamento, 'ok')); }
      } catch (e) { /* ignora */ }
    }
    const novos = ORD.filter((o) => o.status === 'pagamento_confirmado' && known && !known.has(o.id));
    known = new Set([...(known || []), ...ORD.map((o) => o.id)]);
    if (novos.length && !first) { beep(); novos.forEach((o) => toast('🔔 Novo pedido pago: #' + o.numero + ' — ' + o.cliente_nome, 'ok')); }
    const c = (s) => ORD.filter((o) => o.status === s).length;
    const bd = $('bd-pedidos'); if (bd) { const n = c('pagamento_confirmado'); bd.textContent = n; bd.classList.toggle('hide', !n); }
    if (!first && (tab === 'pedidos' || tab === 'inicio')) go(tab, true);
    if (!first && tab === 'todos' && isAdmin()) tTodos(true);
  }
  const FILA_ST = { pagamento_confirmado: 'Novo pedido (pago)', em_separacao: 'Separando', pronto_entrega: 'Pronto para sair', saiu_entrega: 'Saiu para entrega' };
  let filaF = 'todos';
  function orderCard(o) {
    const a = o.endereco || {}, its = o.itens_pedido || [];
    const end = (a.rua || '') + ', ' + (a.numero || '') + (a.complemento ? ' — ' + a.complemento : '') + ' - ' + (a.bairro || '') + ', ' + (a.cidade || '') + '/' + (a.estado || '') + (a.cep ? ' (CEP ' + a.cep + ')' : '');
    const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(end);
    const zap = 'https://wa.me/55' + String(o.cliente_tel || '').replace(/\D/g, '').replace(/^55/, '');
    const forma = o.forma_pagamento || 'online';
    let h = '<div class="card order ' + o.status + '"><h3>#' + o.numero + ' • ' + esc(FILA_ST[o.status] || STATUS[o.status]) + '</h3>' +
      '<div class="meta small mut">' + dt(o.pago_em || o.created_at) + (o.separado_por ? ' • Separando: ' + esc(nm(o.separado_por)) : '') + '</div>' +
      '<div style="margin-top:4px"><b>' + esc(o.cliente_nome) + '</b> • <a style="color:var(--y)" target="_blank" rel="noopener" href="' + esc(zap) + '">' + esc(o.cliente_tel) + '</a></div>' +
      '<div style="margin:4px 0">📍 ' + esc(end) + ' <a href="' + esc(mapUrl) + '" target="_blank" rel="noopener" style="color:var(--y)">ver no mapa</a></div>';
    if (o.status === 'em_separacao') {
      h += '<div class="small mut" style="margin-top:6px">Marque cada item conforme separar:</div>' + its.map((i) => '<label class="pcheck ' + (i.conferido ? 'ok' : '') + '" style="margin:6px 0"><input type="checkbox" data-conf="' + i.id + '" ' + (i.conferido ? 'checked' : '') + '><span><b>' + i.pacotes + 'x</b> ' + esc(i.nome) + '</span></label>').join('');
    } else {
      h += '<ul style="margin:6px 0 6px 20px;padding:0">' + its.map((i) => '<li><b>' + i.pacotes + 'x</b> ' + esc(i.nome) + '</li>').join('') + '</ul>';
    }
    h += '<div>💳 Pago no ' + esc(forma) + ' ✅</div>' + (o.observacoes ? '<div style="margin-top:4px">📝 ' + esc(o.observacoes) + '</div>' : '') +
      (isAdmin() ? '<div class="price" style="font-size:22px;margin-top:6px">TOTAL ' + money(o.total) + '</div>' : '') + '<div class="row" style="margin-top:10px">';
    if (o.status === 'pagamento_confirmado') h += '<button class="btn grow" data-a="assumir" data-id="' + o.id + '">Assumir separação</button>';
    if (o.status === 'em_separacao') {
      const ok = its.every((i) => i.conferido);
      h += '<button class="btn green grow" data-a="pronto" data-id="' + o.id + '" ' + (ok ? '' : 'disabled') + '>Pronto para entrega</button><button class="btn sec sm" data-a="devolver" data-id="' + o.id + '">Devolver à fila</button>';
    }
    if (o.status === 'pronto_entrega') h += '<button class="btn green grow" data-a="saida" data-id="' + o.id + '">SAIU PARA ENTREGA</button><button class="btn sec sm" data-a="devolver" data-id="' + o.id + '">Devolver à fila</button>';
    if (o.status === 'saiu_entrega') h += '<button class="btn green grow" data-a="entregue" data-id="' + o.id + '">Entregue</button>';
    return h + '</div></div>';
  }
  async function tPedidos() {
    const n = (st) => ORD.filter((o) => o.status === st).length;
    const chips = [['todos', 'Todos (' + ORD.length + ')'], ['pagamento_confirmado', 'Novos (' + n('pagamento_confirmado') + ')'], ['em_separacao', 'Separando (' + n('em_separacao') + ')'], ['pronto_entrega', 'Prontos (' + n('pronto_entrega') + ')'], ['saiu_entrega', 'Em entrega (' + n('saiu_entrega') + ')']];
    const lista = ORD.filter((o) => filaF === 'todos' || o.status === filaF);
    $('view').innerHTML = '<h2>Pedidos</h2><div class="small mut" style="margin-bottom:8px">Só aparecem pedidos já pagos. A tela avisa quando entrar um novo.</div>' +
      '<div class="row" style="margin-bottom:10px">' + chips.map((c) => '<button class="pill ' + (c[0] === filaF ? 'on' : '') + '" data-fq="' + c[0] + '">' + c[1] + '</button>').join('') + '</div>' +
      (lista.map(orderCard).join('') || '<div class="card mut">Nenhum pedido por aqui.</div>');
  }
  async function orderAction(a, id) {
    if (a === 'assumir') await rpc('assumir_separacao', { p_pedido: id });
    else if (a === 'pronto') await rpc('marcar_pronto', { p_pedido: id });
    else if (a === 'devolver') { if (!(await confirmBox('<h3>Devolver o pedido à fila?</h3><p class="mut">As conferências feitas serão apagadas.</p>'))) return; await rpc('liberar_separacao', { p_pedido: id }); }
    else if (a === 'saida') {
      const o = ORD.find((x) => x.id === id);
      if (!(await confirmBox('<h3>Registrar saída do pedido #' + o.numero + '?</h3><p>Os pacotes sairão da câmara fria e a baixa do estoque será feita agora. Isso não pode ser desfeito aqui.</p>', 'Registrar saída'))) return;
      await rpc('registrar_saida', { p_pedido: id }); toast('Saída registrada.', 'ok');
    } else if (a === 'entregue') await rpc('marcar_entregue', { p_pedido: id });
    await refreshOrders(true); go(tab, true);
  }

  // ---------- início ----------
  async function tInicio() {
    const hoje = todayStr();
    const adm = AREA === 'admin';
    const mine = adm ? [] : await q(sb.from('producoes').select('*, produtos(nome,unidades_pacote,unidade), lotes(codigo)').eq('usuario_id', me.id).gte('created_at', hoje + 'T00:00:00').order('created_at', { ascending: false }));
    const total = mine.reduce((s, p) => s + p.pacotes, 0), c = (s) => ORD.filter((o) => o.status === s).length;
    const estRows = await rpc('estoque_resumo', { p_todos: false }), estMap = {};
    estRows.forEach((r) => { const x = estMap[r.produto] = estMap[r.produto] || { nome: r.produto, disp: 0, res: 0 }; x.disp += r.disponivel; x.res += r.reservada; });
    const est = Object.values(estMap);
    let h = '';
    if (isAdmin() && AREA === 'admin') h += '<div class="card"><b>Link da loja para os clientes</b><div class="copia" id="lojaUrl">' + esc(location.origin + location.pathname.replace(/[^/]*$/, '')) + '</div><div class="row"><button class="btn sm" id="cpLoja">Copiar link</button><a class="btn sm sec" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('Peça seus espetinhos pelo link: ' + location.origin + location.pathname.replace(/[^/]*$/, '')) + '">Compartilhar no WhatsApp</a></div></div>';
    h += '<h2>Olá, ' + esc((me.nome || me.email).split(' ')[0]) + '!</h2><div class="kpi">' +
      (adm ? '' : '<div><span class="small mut">Minha produção hoje</span><b>' + pk(total) + '</b><span class="small mut">' + eqSum(mine.map((p) => ({ pacotes: p.pacotes, unidades_pacote: p.produtos.unidades_pacote, unidade: p.produtos.unidade }))) + '</span></div>') +
      '<div><span class="small mut">Aguardando separação</span><b>' + c('pagamento_confirmado') + '</b></div>' +
      '<div><span class="small mut">Em separação</span><b>' + c('em_separacao') + '</b></div>' +
      '<div><span class="small mut">Prontos para sair</span><b>' + c('pronto_entrega') + '</b></div></div>' +
      '<div class="row" style="margin:14px 0">' + (adm ? '' : '<button class="btn grow" data-go="producao">➕ Registrar produção</button>') + '<button class="btn sec grow" data-go="pedidos">📦 Ver pedidos</button><button class="btn sec grow" data-go="estoque">❄️ Câmara fria</button></div>' +
      '<div class="card"><div class="row"><h3 class="grow">❄️ Estoque na câmara fria agora</h3><button class="btn sm sec" data-go="estoque">Ver detalhes</button></div>' + (est.length ? est.map((e) => '<div class="sumline"><span>' + esc(e.nome) + '</span><b style="color:' + (e.disp <= 0 ? 'var(--bad)' : e.disp <= 3 ? 'var(--y)' : 'var(--ok)') + '">' + e.disp + ' pacote' + (e.disp === 1 ? '' : 's') + (e.res ? ' <span class="mut small">(' + e.res + ' reservado' + (e.res === 1 ? '' : 's') + ')</span>' : '') + '</b></div>').join('') : '<div class="mut">Câmara fria vazia.</div>') + '</div>' +
      (adm ? '' : '<div class="card"><h3>Minha produção de hoje</h3>' + (mine.length ? '<div class="scroll"><table><tr><th>Hora</th><th>Produto</th><th>Lote</th><th>Pacotes</th></tr>' + mine.map((p) => '<tr><td>' + dt(p.created_at).slice(6) + '</td><td>' + esc(p.produtos.nome) + '</td><td>' + esc(p.lotes.codigo) + '</td><td><b>' + p.pacotes + '</b> <span class="mut small">(' + eq(p.pacotes, p.produtos) + ')</span></td></tr>').join('') + '</table></div>' : '<div class="mut">Você ainda não registrou produção hoje.</div>') + '</div>');
    if (isAdmin() && AREA === 'admin') {
      const c2 = await q(sb.from('config').select('pagamento').eq('id', 1).single());
      const aguardaM = await q(sb.from('pedidos').select('id', { count: 'exact', head: true }).eq('pgto_manual', true).eq('status', 'aguardando_pagamento').eq('pgto_status', 'pendente'));
      const pend = await q(sb.from('pedidos').select('id', { count: 'exact', head: true }).or('excecao.eq.true,reembolso_status.eq.pendente'));
      const vd = await q(sb.from('pedidos').select('total, itens_pedido(pacotes)').eq('pgto_status', 'aprovado').neq('status', 'cancelado').gte('pago_em', hoje + 'T00:00:00'));
      const vTot = vd.reduce((x, o) => x + Number(o.total), 0), vPac = vd.reduce((x, o) => x + o.itens_pedido.reduce((y, i) => y + i.pacotes, 0), 0);
      h = '<div class="kpi" style="margin-bottom:12px"><div><span class="small mut">💰 Vendas de hoje</span><b>' + money(vTot) + '</b></div><div><span class="small mut">Pedidos pagos hoje</span><b>' + vd.length + '</b></div><div><span class="small mut">Pacotes vendidos hoje</span><b>' + vPac + '</b></div></div>' + h;
      h = (c2.pagamento && (c2.pagamento.ativo || (c2.pagamento.manual && c2.pagamento.manual.ativo)) ? '' : '<div class="errbox">⚠️ Nenhuma forma de pagamento está ativa: os clientes ainda não conseguem finalizar compras. <a href="#" data-go="pagto" style="color:var(--y)">Configurar agora</a></div>') + h;
      const rec = [...(await q(sb.from('despesas').select('id,descricao,valor,tipo,foto_path,created_at').not('foto_path', 'is', null).order('created_at', { ascending: false }).limit(6))).map((x) => ({ ...x, k: x.tipo === 'compra' ? 'Compra' : 'Despesa' })), ...(await q(sb.from('vendas_externas').select('id,descricao,valor,foto_path,created_at').not('foto_path', 'is', null).order('created_at', { ascending: false }).limit(6))).map((x) => ({ ...x, k: 'Venda' }))].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);
      const urls = rec.length ? await Promise.all(rec.map((x) => sb.storage.from('alex-notas').createSignedUrl(x.foto_path, 3600))) : [];
      h = '<div class="card" style="border-color:var(--o)"><h3>📷 Foto da nota</h3><label class="btn" style="display:block;text-align:center;cursor:pointer;margin:8px 0">📷 Tirar foto da nota / boleto<input id="iFoto" type="file" accept="image/*" capture="environment" style="display:none"></label><div class="small mut">O sistema separa sozinho: compra de mercadoria, conta/boleto (despesa) ou nota de venda (soma nas vendas).</div><div id="iNota"></div>' +
        (rec.length ? '<div class="small mut" style="margin-top:10px">Últimas notas lançadas</div><div class="row" style="flex-wrap:wrap;gap:8px;margin-top:6px">' + rec.map((x, i) => urls[i].data ? '<button type="button" data-nota="' + esc(x.foto_path) + '" style="background:none;border:0;padding:0;width:92px;text-align:left;color:inherit"><img src="' + esc(urls[i].data.signedUrl) + '" style="width:92px;height:92px;object-fit:cover;border-radius:10px;display:block"><span class="small" style="display:block"><b>' + x.k + '</b> ' + money(x.valor) + '</span></button>' : '').join('') + '</div>' : '') + '</div>' + h;
      if (aguardaM) h = '<div class="warn">💵 Há <b>' + aguardaM + '</b> pedido(s) esperando você confirmar o pagamento. <a href="#" data-go="todos" style="color:var(--y)">Ver agora</a></div>' + h;
      if (pend) h = '<div class="warn">Há pedidos com pendência ou reembolso para resolver. <a href="#" data-go="todos" style="color:var(--y)">Ver</a></div>' + h;
    }
    $('view').innerHTML = h;
    if (notaUlt && $('iNota')) $('iNota').innerHTML = '<div class="card" style="border-color:var(--ok)">✅ ' + notaUlt + '<div class="row" style="margin-top:8px"><button class="btn sm grow" data-go="financeiro">Ver / corrigir no Financeiro</button></div></div>';
    if ($('iFoto')) $('iFoto').onchange = (e) => { const f = e.target.files[0]; if (f) notaAuto(f, $('iNota'), tInicio); };
    document.querySelectorAll('#view [data-nota]').forEach((b) => { b.onclick = act(async () => { const u = await sb.storage.from('alex-notas').createSignedUrl(b.dataset.nota, 600); if (u.error) throw new Error(u.error.message); modal('<h3>Foto da nota</h3><img src="' + esc(u.data.signedUrl) + '" style="max-width:100%;border-radius:10px"><button class="btn sec" id="nFecha" style="margin-top:10px">Fechar</button>'); $('nFecha').onclick = closeModal; }); });
    if ($('cpLoja')) $('cpLoja').onclick = async () => { try { await navigator.clipboard.writeText($('lojaUrl').textContent); toast('Link copiado!', 'ok'); } catch (e) { toast('Copie o link manualmente.'); } };
  }

  // ---------- produzir ----------
  async function tProducao() {
    products = await q(sb.from('produtos').select('*').eq('ativo', true).order('ordem').order('nome'));
    if (!products.length) { $('view').innerHTML = '<h2>Registrar produção</h2><div class="warn">Nenhum produto cadastrado. Peça ao Alexandre.</div>'; return; }
    prodIdem = prodIdem || uid();
    const hoje = todayStr();
    $('view').innerHTML = '<h2>Registrar produção</h2><div class="small mut">Só lance pacotes <b>prontos</b> e guardados na câmara fria. 1 pacote = 10 espetinhos (palito de bambu: 500).</div><div id="prRes"></div>' +
      '<label>Produto / sabor</label><select id="pProd">' + products.map((p) => '<option value="' + p.id + '">' + esc(p.nome) + '</option>').join('') + '</select>' +
      '<label>Quantos pacotes?</label><div class="stepper"><button type="button" id="pMenos">−</button><input id="pQtd" type="number" inputmode="numeric" min="1" step="1" value="1" style="text-align:center;font-size:24px;font-weight:800"><button type="button" class="plus" id="pMais">+</button></div><div class="small mut" id="pEq"></div>' +
      '<label>Data</label><input id="pFab" type="date" max="' + hoje + '" value="' + hoje + '"><div id="pErr"></div>' +
      '<button class="btn" id="pOk" style="margin-top:14px">Registrar produção</button>';
    const calc = () => { const n = Number($('pQtd').value); $('pEq').textContent = n > 0 ? '= ' + eq(n, products.find((x) => x.id === $('pProd').value)) : ''; };
    $('pProd').onchange = calc; $('pQtd').oninput = calc;
    $('pMenos').onclick = () => { $('pQtd').value = Math.max(1, Number($('pQtd').value || 1) - 1); calc(); };
    $('pMais').onclick = () => { $('pQtd').value = Number($('pQtd').value || 0) + 1; calc(); };
    calc();
    $('pOk').onclick = act(async () => {
      const err = (m) => { $('pErr').innerHTML = '<div class="errbox">' + esc(m) + '</div>'; }; $('pErr').innerHTML = '';
      const n = Number($('pQtd').value), p = products.find((x) => x.id === $('pProd').value);
      if (!Number.isInteger(n) || n <= 0) return err('Digite um número inteiro de pacotes, maior que zero.');
      if (!$('pFab').value) return err('Informe a data.');
      const ok = await confirmBox('<h3>Confirmar produção</h3><p><b>' + pk(n) + '</b> de <b>' + esc(p.nome) + '</b><br>= ' + eq(n, p) + '<br>Data: ' + dday($('pFab').value) + '</p><p class="small mut">Será registrado em seu nome.</p>', 'Confirmar');
      if (!ok) return;
      try {
        const r = await rpc('registrar_producao', { p_produto: p.id, p_pacotes: n, p_fabricacao: $('pFab').value, p_lote: '', p_validade: null, p_obs: '', p_idem: prodIdem });
        prodIdem = null;
        if (r.duplicado) { toast('Este lançamento já tinha sido registrado.', 'ok'); return tInicio(); }
        await tProducao();
        $('prRes').innerHTML = '<div class="okbox"><b>✅ Produção registrada</b><br>' + pk(r.pacotes) + ' (' + r.espetinhos + ' ' + esc(r.unidade) + ') de <b>' + esc(r.produto) + '</b><br>Lançado por ' + esc(r.por) + ' em ' + dt(r.quando) + '</div>';
        window.scrollTo(0, 0);
      } catch (e) { err(e.message); }
    });
  }
  const nz = (s) => String(s || '').trim();

  // ---------- câmara fria ----------
  async function tEstoque() {
    const rows = await rpc('estoque_resumo', { p_todos: false });
    const mov = await q(sb.from('movimentos').select('*, produtos(nome)').order('created_at', { ascending: false }).limit(60));
    const by = {}; rows.forEach((r) => { (by[r.produto] = by[r.produto] || []).push(r); });
    let h = '<h2>Câmara fria / Estoque</h2><div class="small mut">Tudo em <b>pacotes</b> (1 pacote = 10 espetinhos; palito de bambu = 500). Disponível = o que ainda pode ser vendido.</div>';
    if (!rows.length) h += '<div class="card mut" style="margin-top:10px">Câmara fria vazia.</div>';
    Object.keys(by).forEach((p) => {
      const l = by[p], f = l.reduce((s, x) => s + x.fisica, 0), r = l.reduce((s, x) => s + x.reservada, 0), d = l.reduce((s, x) => s + x.disponivel, 0);
      h += '<div class="card"><div class="row"><h3 class="grow">' + esc(p) + '</h3><span class="tag">Tem ' + f + '</span><span class="tag warn">Reservado ' + r + '</span><span class="tag ok">Disponível ' + d + '</span></div>' +
        (isAdmin() ? '<details style="margin-top:8px"><summary class="small mut" style="cursor:pointer">Lotes e ajustes</summary><div class="scroll"><table><tr><th>Lote</th><th>Fabricação</th><th>Validade</th><th>Tem</th><th>Reserv.</th><th>Disp.</th><th></th></tr>' +
          l.map((x) => '<tr><td>' + esc(x.codigo) + (x.bloqueado ? ' <span class="tag bad">Bloqueado</span>' : '') + (x.vencido ? ' <span class="tag bad">Vencido</span>' : '') + '</td><td>' + dday(x.fabricacao) + '</td><td>' + dday(x.validade) + '</td><td>' + x.fisica + '</td><td>' + x.reservada + '</td><td><b>' + x.disponivel + '</b></td><td><button class="btn sm sec" data-ajuste="' + x.lote_id + '" data-nome="' + esc(p + ' — lote ' + x.codigo) + '">Ajustar</button> <button class="btn sm sec" data-bloq="' + x.lote_id + '" data-b="' + (x.bloqueado ? 0 : 1) + '">' + (x.bloqueado ? 'Desbloquear' : 'Bloquear') + '</button></td></tr>').join('') + '</table></div></details>' : '') + '</div>';
    });
    const TM = { producao: 'Produção', saida: 'Saiu p/ entrega', perda: 'Perda', avaria: 'Avaria', devolucao: 'Devolução', ajuste_entrada: 'Ajuste (+)', ajuste_saida: 'Ajuste (−)' };
    h += '<div class="card"><h3>Entradas e saídas</h3><div class="scroll"><table><tr><th>Data</th><th>Produto</th><th>O que foi</th><th>Pacotes</th><th>Quem</th></tr>' +
      mov.map((m) => '<tr><td>' + dt(m.created_at) + '</td><td>' + esc(m.produtos.nome) + '</td><td>' + esc(TM[m.tipo]) + (isAdmin() && m.justificativa ? '<br><span class="mut small">' + esc(m.justificativa) + '</span>' : '') + '</td><td style="color:' + (m.qtd > 0 ? 'var(--ok)' : 'var(--bad)') + '"><b>' + (m.qtd > 0 ? '+' : '') + m.qtd + '</b></td><td>' + esc(nm(m.usuario_id)) + '</td></tr>').join('') + '</table></div></div>';
    $('view').innerHTML = h;
  }
  function ajusteModal(lote, nome) {
    modal('<h3>Ajustar estoque</h3><p class="mut small">' + esc(nome) + '</p><label>Tipo</label><select id="jTipo"><option value="perda">Perda</option><option value="avaria">Avaria</option><option value="devolucao">Devolução (mercadoria conferida e autorizada)</option><option value="ajuste_entrada">Correção: somar</option><option value="ajuste_saida">Correção: subtrair</option></select>' +
      '<label>Pacotes</label><input id="jQtd" type="number" min="1" step="1" inputmode="numeric" value="1"><label>Justificativa (obrigatória)</label><textarea id="jJust"></textarea><div id="jErr"></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn sec grow" id="jNo">Cancelar</button><button class="btn grow" id="jOk">Registrar</button></div>');
    $('jNo').onclick = closeModal;
    $('jOk').onclick = act(async () => {
      try { await rpc('ajustar_estoque', { p_lote: lote, p_tipo: $('jTipo').value, p_qtd: Number($('jQtd').value), p_just: $('jJust').value }); closeModal(); toast('Ajuste registrado.', 'ok'); tEstoque(); }
      catch (e) { $('jErr').innerHTML = '<div class="errbox">' + esc(e.message) + '</div>'; }
    });
  }

  // ---------- admin: todos os pedidos ----------
  async function tTodos(silent) {
    const rows = await q(sb.from('pedidos').select('*, itens_pedido(*)').order('numero', { ascending: false }).limit(200));
    const pend = (o) => o.excecao || o.alerta || o.reembolso_status === 'pendente' || (o.pgto_manual && o.status === 'aguardando_pagamento' && o.pgto_status === 'pendente');
    const F = { pend: ['Pendências', (o) => pend(o)], aguard: ['Aguardando pgto', (o) => o.status === 'aguardando_pagamento'], and: ['Em andamento', (o) => ['pagamento_confirmado', 'em_separacao', 'pronto_entrega', 'saiu_entrega'].includes(o.status)], ent: ['Entregues', (o) => o.status === 'entregue'], canc: ['Cancelados', (o) => o.status === 'cancelado'], todos: ['Todos', () => true] };
    const s = ordSearch.toLowerCase();
    const noDia = (o) => !ordDay || ordFilter === 'pend' || ldate(o.pago_em || o.created_at) === ordDay;
    const list = rows.filter(F[ordFilter][1]).filter(noDia).filter((o) => !s || String(o.numero).includes(s) || (o.cliente_nome || '').toLowerCase().includes(s));
    const vendas = rows.filter((o) => o.pgto_status === 'aprovado' && o.status !== 'cancelado' && (!ordDay || ldate(o.pago_em) === ordDay));
    const vTot = vendas.reduce((x, o) => x + Number(o.total), 0), vPac = vendas.reduce((x, o) => x + (o.itens_pedido || []).reduce((y, i) => y + i.pacotes, 0), 0);
    if (silent && document.activeElement && document.activeElement.id === 'oSearch') return;
    let h = '<h2>Todos os pedidos</h2><div class="row" style="margin-bottom:8px">' + Object.keys(F).map((k) => '<button class="pill ' + (k === ordFilter ? 'on' : '') + '" data-of="' + k + '">' + F[k][0] + ' (' + rows.filter(F[k][1]).length + ')</button>').join('') + '</div>' +
      '<div class="row" style="margin-bottom:10px"><div class="grow"><label style="margin-top:0">Dia</label><input id="oDia" type="date" value="' + ordDay + '"></div><button class="pill" id="oTodosDias">Todos os dias</button></div>' +
      '<div class="kpi" style="margin-bottom:10px"><div><span class="small mut">💰 Total vendido ' + (ordDay ? 'em ' + dday(ordDay) : '(todos os dias)') + '</span><b>' + money(vTot) + '</b></div><div><span class="small mut">Pedidos pagos</span><b>' + vendas.length + '</b></div><div><span class="small mut">Pacotes</span><b>' + vPac + '</b></div></div>' +
      '<input id="oSearch" placeholder="Buscar por número ou nome" value="' + esc(ordSearch) + '" style="margin-bottom:10px">';
    h += list.map((o) => {
      const a = o.endereco || {}, its = o.itens_pedido || [], tot = its.reduce((x, i) => x + i.pacotes, 0);
      return '<div class="card order ' + (o.status === 'cancelado' ? 'cancelado' : o.status === 'entregue' ? 'entregue' : '') + (o.excecao ? ' exc' : '') + '"><div class="row"><h3 class="grow">#' + o.numero + ' — ' + esc(o.cliente_nome) + '</h3><span class="tag y">' + esc(STATUS[o.status]) + '</span></div>' +
        '<div class="small mut">' + dt(o.created_at) + ' • Pgto: <b>' + esc(PGTO[o.pgto_status]) + '</b> • Reembolso: ' + esc(REEMB[o.reembolso_status]) + ' • ' + money(o.total) + '</div>' +
        (o.pgto_manual && o.status === 'aguardando_pagamento' ? '<div class="warn" style="margin:8px 0">💵 O cliente escolheu: <b>' + esc(o.forma_pagamento) + '</b>. Quando receber, toque em "Confirmar pagamento recebido".</div>' : '') + (o.excecao ? '<div class="errbox" style="margin:8px 0"><b>PENDÊNCIA:</b> ' + esc(o.excecao_motivo) + '</div>' : '') + (o.alerta ? '<div class="warn" style="margin:8px 0">⚠️ ' + esc(o.alerta) + '</div>' : '') + (o.cancelado_motivo ? '<div class="small mut">Motivo do cancelamento: ' + esc(o.cancelado_motivo) + '</div>' : '') +
        '<div class="small" style="margin-top:6px">' + its.map((i) => pk(i.pacotes) + ' • ' + esc(i.nome)).join('<br>') + '<br><span class="mut">Total ' + pk(tot) + ' (' + eqSum(its) + ')</span></div>' +
        '<div class="small mut" style="margin-top:6px">📍 ' + esc(a.rua + ', ' + a.numero + ' — ' + a.bairro + ', ' + a.cidade) + '<br>📞 <a style="color:var(--y)" target="_blank" rel="noopener" href="https://wa.me/55' + esc(String(o.cliente_tel || '').replace(/\D/g, '').replace(/^55/, '')) + '">' + esc(o.cliente_tel) + '</a> • ' + esc(o.cliente_email) + '</div>' +
        '<div class="small mut">Separação: ' + esc(nm(o.separado_por)) + ' • Saída liberada por: ' + esc(nm(o.liberado_por)) + (o.saiu_em ? ' em ' + dt(o.saiu_em) : '') + '</div>' +
        '<div class="row" style="margin-top:10px">' +
        (o.status === 'aguardando_pagamento' && o.pgto_status !== 'aprovado' ? '<button class="btn sm green" data-x="pagar" data-id="' + o.id + '">✅ Confirmar pagamento recebido</button>' : '') +
        (o.excecao ? '<button class="btn sm" data-x="resolver" data-id="' + o.id + '">Resolver (realocar estoque)</button>' : '') +
        (o.pgto_status === 'aprovado' && ['pagamento_confirmado', 'em_separacao', 'pronto_entrega'].includes(o.status) && !o.excecao ? '<button class="btn sm sec" data-x="realocar" data-id="' + o.id + '">Realocar lotes</button>' : '') +
        (!['cancelado', 'entregue'].includes(o.status) ? '<button class="btn sm red" data-x="cancelar" data-id="' + o.id + '">Cancelar pedido</button>' : '') +
        (o.pgto_status === 'aprovado' || o.reembolso_status !== 'nao_solicitado' ? '<button class="btn sm sec" data-x="reembolso" data-id="' + o.id + '">Reembolso</button>' : '') + '</div></div>';
    }).join('') || '<div class="card mut">Nenhum pedido neste filtro.</div>';
    $('view').innerHTML = h;
    $('oDia').onchange = (e) => { ordDay = e.target.value; tTodos(); };
    $('oTodosDias').onclick = () => { ordDay = ''; tTodos(); };
    $('oSearch').oninput = (e) => { ordSearch = e.target.value; clearTimeout(tTodos.t); tTodos.t = setTimeout(() => tTodos(), 300); };
    if (silent === undefined && ordSearch) { const i = $('oSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }
  async function adminOrder(a, id) {
    if (a === 'pagar') {
      const ped = (await q(sb.from('pedidos').select('numero,total,forma_pagamento,cliente_nome').eq('id', id).single()));
      if (!(await confirmBox('<h3>Confirmar pagamento do pedido #' + ped.numero + '?</h3><p>Cliente: <b>' + esc(ped.cliente_nome) + '</b><br>Valor: <b>' + money(ped.total) + '</b>' + (ped.forma_pagamento ? '<br>Forma: <b>' + esc(ped.forma_pagamento) + '</b>' : '') + '</p><p class="small mut">Só confirme depois de receber. O pedido vai para a fila da equipe e fica registrado que foi você que confirmou.</p>', 'Recebi, confirmar'))) return;
      await rpc('confirmar_pagamento_manual', { p_pedido: id }); toast('Pagamento confirmado. O pedido foi para a equipe.', 'ok'); tTodos(); refreshOrders(true); return;
    }
    if (a === 'cancelar') {
      modal('<h3>Cancelar pedido</h3><p class="mut small">As reservas de estoque serão liberadas. Se o pedido estava pago, o reembolso ficará como pendente. Mercadoria que já saiu NÃO volta ao estoque sozinha.</p><label>Motivo (obrigatório)</label><textarea id="cMot"></textarea><div id="cErr"></div><div class="row" style="margin-top:12px"><button class="btn sec grow" id="cNo">Voltar</button><button class="btn red grow" id="cOk">Cancelar pedido</button></div>');
      $('cNo').onclick = closeModal;
      $('cOk').onclick = act(async () => { try { await rpc('cancelar_pedido', { p_pedido: id, p_motivo: $('cMot').value }); closeModal(); tTodos(); refreshOrders(true); } catch (e) { $('cErr').innerHTML = '<div class="errbox">' + esc(e.message) + '</div>'; } });
    } else if (a === 'reembolso') {
      modal('<h3>Reembolso</h3><p class="mut small">O estorno em si é feito no painel do provedor de pagamento; aqui você controla a situação.</p><label>Situação</label><select id="rSt"><option value="nao_solicitado">Não solicitado</option><option value="pendente">Pendente</option><option value="concluido">Concluído</option><option value="negado">Negado</option></select><label>Observação</label><textarea id="rObs"></textarea><div id="rErr"></div><div class="row" style="margin-top:12px"><button class="btn sec grow" id="rNo">Voltar</button><button class="btn grow" id="rOk">Salvar</button></div>');
      $('rNo').onclick = closeModal;
      $('rOk').onclick = act(async () => { try { await rpc('atualizar_reembolso', { p_pedido: id, p_status: $('rSt').value, p_obs: $('rObs').value }); closeModal(); tTodos(); } catch (e) { $('rErr').innerHTML = '<div class="errbox">' + esc(e.message) + '</div>'; } });
    } else if (a === 'resolver') {
      if (!(await confirmBox('<h3>Resolver pendência</h3><p>Vamos tentar reservar o estoque para este pedido agora (lotes que vencem antes primeiro). Se ainda não houver estoque, nada muda — registre a produção antes ou cancele o pedido.</p>', 'Realocar estoque'))) return;
      await rpc('resolver_excecao', { p_pedido: id, p_acao: 'realocar' }); toast('Pendência resolvida.', 'ok'); tTodos(); refreshOrders(true);
    } else if (a === 'realocar') {
      await rpc('realocar_pedido', { p_pedido: id }); toast('Lotes realocados.', 'ok'); tTodos(); refreshOrders(true);
    }
  }

  // ---------- admin: produtos ----------
  async function tProdutos() {
    products = await q(sb.from('produtos').select('*').order('ordem').order('nome'));
    $('view').innerHTML = '<div class="row"><h2 class="grow">Produtos</h2><button class="btn sm" id="pNovo">+ Novo produto</button></div><div class="small mut">Os produtos são vendidos em pacotes (espetinhos: 10 por pacote; palito de bambu: 500). O preço é por pacote.</div>' +
      products.map((p) => '<div class="card"><div class="row"><img class="ph" src="' + esc(p.foto_url || 'logo.png') + '"><div class="grow"><b>' + esc(p.nome) + '</b> ' + (p.ativo ? '<span class="tag ok">Ativo</span>' : '<span class="tag bad">Inativo</span>') + '<div class="small mut">' + esc(p.descricao) + '</div><div class="price" style="font-size:18px">' + money(p.preco_pacote) + ' / pacote</div><div class="small mut">Validade: ' + p.validade_dias + ' dias</div></div><button class="btn sm sec" data-edit="' + p.id + '">Editar</button></div>' +
      '<div class="row" style="margin-top:10px"><div class="grow"><label style="margin:0">Novo preço do pacote (R$)</label><input id="qp-' + p.id + '" inputmode="decimal" value="' + String(p.preco_pacote).replace('.', ',') + '"></div><button class="btn sm" data-qprice="' + p.id + '">Salvar preço</button></div></div>').join('');
    $('pNovo').onclick = () => prodModal(null);
  }
  function prodModal(id) {
    const p = products.find((x) => x.id === id) || { nome: '', descricao: '', preco_pacote: '', validade_dias: 90, ativo: true, ordem: 0, foto_url: '' };
    modal('<h3>' + (id ? 'Editar' : 'Novo') + ' produto</h3><label>Nome / sabor</label><input id="mNome" value="' + esc(p.nome) + '"><label>Descrição</label><textarea id="mDesc">' + esc(p.descricao) + '</textarea>' +
      '<div class="cols"><div><label>Preço do pacote (R$)</label><input id="mPreco" inputmode="decimal" value="' + (p.preco_pacote === '' ? '' : String(p.preco_pacote).replace('.', ',')) + '"></div><div><label>Validade (dias)</label><input id="mVal" type="number" min="1" value="' + p.validade_dias + '"></div></div>' +
      '<div class="cols"><div><label>Ordem na loja</label><input id="mOrd" type="number" value="' + p.ordem + '"></div><div><label>Situação</label><select id="mAtivo"><option value="1" ' + (p.ativo ? 'selected' : '') + '>Ativo</option><option value="0" ' + (!p.ativo ? 'selected' : '') + '>Inativo</option></select></div></div>' +
      '<div class="cols"><div><label>Unidades por pacote</label><input id="mUn" type="number" min="1" value="' + (p.unidades_pacote || 10) + '"></div><div><label>Unidade</label><input id="mUnN" value="' + esc(p.unidade || 'espetinhos') + '"></div></div><label>Estoque ilimitado?</label><select id="mIli"><option value="0" ' + (!p.ilimitado ? 'selected' : '') + '>Não (controla a câmara fria)</option><option value="1" ' + (p.ilimitado ? 'selected' : '') + '>Sim (sempre disponível)</option></select><label>Só por encomenda?</label><select id="mEnc"><option value="0" ' + (!p.sob_encomenda ? 'selected' : '') + '>Não</option><option value="1" ' + (p.sob_encomenda ? 'selected' : '') + '>Sim (sem estoque pronto)</option></select>' + '<label>Foto</label>' + (p.foto_url ? '<img class="ph" style="width:100px;height:100px" src="' + esc(p.foto_url) + '"><br>' : '') + '<input id="mFoto" type="file" accept="image/*"><div id="mErr"></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn sec grow" id="mNo">Cancelar</button><button class="btn grow" id="mOk">Salvar</button></div>');
    $('mNo').onclick = closeModal;
    $('mOk').onclick = act(async () => {
      const err = (m) => { $('mErr').innerHTML = '<div class="errbox">' + esc(m) + '</div>'; };
      const preco = Number(String($('mPreco').value).replace(',', '.'));
      if (nz($('mNome').value).length < 2) return err('Digite o nome.');
      if (!(preco > 0)) return err('Digite um preço maior que zero.');
      const row = { nome: nz($('mNome').value), descricao: nz($('mDesc').value), preco_pacote: preco, validade_dias: Number($('mVal').value) || 90, ordem: Number($('mOrd').value) || 0, ativo: $('mAtivo').value === '1', sob_encomenda: $('mEnc').value === '1', ilimitado: $('mIli').value === '1', unidades_pacote: Math.max(1, parseInt($('mUn').value, 10) || 10), unidade: nz($('mUnN').value) || 'espetinhos' };
      try {
        const f = $('mFoto').files[0];
        if (f) {
          const blob = await shrink(f), path = 'p-' + uid() + '.jpg';
          const up = await sb.storage.from('alex-produtos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
          if (up.error) throw new Error('Foto: ' + up.error.message);
          row.foto_url = sb.storage.from('alex-produtos').getPublicUrl(path).data.publicUrl;
        }
        if (id) await q(sb.from('produtos').update(row).eq('id', id)); else await q(sb.from('produtos').insert(row));
        closeModal(); toast('Produto salvo.', 'ok'); tProdutos();
      } catch (e) { err(e.message); }
    });
  }
  function shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { const m = 1000, k = Math.min(1, m / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob((b) => (b ? res(b) : rej(new Error('Imagem inválida.'))), 'image/jpeg', 0.85); };
      img.onerror = () => rej(new Error('Não foi possível ler a imagem.')); img.src = url;
    });
  }

  // ---------- admin: equipe ----------
  async function tEquipe() {
    const l = await rpc('admin_listar_equipe');
    const T = { pendente_equipe: ['Aguardando', 'warn'], funcionaria: ['Funcionária', 'ok'], admin: ['Administrador', 'y'], bloqueado: ['Bloqueado', 'bad'] };
    $('view').innerHTML = '<h2>Equipe</h2><div class="small mut">Cada funcionária cria o próprio acesso em <b>equipe.html</b> (e-mail e senha) e aparece aqui para você aceitar.</div>' +
      (l.map((u) => '<div class="card"><div class="row"><div class="grow"><b>' + esc(u.nome || '(sem nome)') + '</b><div class="small mut">usuário: ' + esc(AX.userName(u.email)) + '</div></div><span class="tag ' + T[u.role][1] + '">' + T[u.role][0] + '</span>' +
        (u.role === 'pendente_equipe' ? '<button class="btn sm green" data-pap="funcionaria" data-id="' + u.id + '">Aceitar</button>' : '') +
        (u.role === 'funcionaria' ? '<button class="btn sm red" data-pap="bloqueado" data-id="' + u.id + '">Bloquear</button>' : '') +
        (u.role === 'bloqueado' ? '<button class="btn sm green" data-pap="funcionaria" data-id="' + u.id + '">Reativar</button>' : '') + (u.role !== 'admin' ? '<button class="btn sm sec" data-pw="' + u.id + '" data-nome="' + esc(u.nome || AX.userName(u.email)) + '">Trocar senha</button>' : '') + '</div></div>').join('') || '<div class="card mut">Ninguém na equipe ainda.</div>');
  }

  // ---------- salário da funcionária (só o dela) ----------
  async function tSalario() {
    const r = await rpc('meu_salario', { p_mes: mesSel + '-01' });
    let h = '<h2>Meu salário</h2><div class="row" style="margin:8px 0"><div class="grow"><label style="margin-top:0">Mês</label><input id="sMes" type="month" value="' + mesSel + '"></div></div>';
    if (!r.cadastrada) {
      $('view').innerHTML = h + '<div class="warn">O seu salário ainda não foi cadastrado. Fale com o Alexandre.</div>';
    } else {
      const TL2 = { vale: 'Vale', hora_extra: 'Hora extra', desconto: 'Desconto', bonus: 'Bônus' };
      h += '<div class="card"><div class="small mut">🕗 ' + esc(r.jornada) + '</div>' +
        '<div class="sumline"><span>Salário base</span><b>' + money(r.salario) + '</b></div>' +
        '<div class="sumline"><span>Comissão: <b>' + r.pacotes_feitos + ' pacote' + (Number(r.pacotes_feitos) === 1 ? '' : 's') + '</b> × ' + money(r.comissao_pacote) + '</span><b style="color:var(--ok)">+ ' + money(r.comissao) + '</b></div>' +
        '<div class="sumline"><span>Horas extras (' + Number(r.he_horas) + ' h)</span><b>' + money(r.he_valor) + '</b></div>' +
        (Number(r.bonus) ? '<div class="sumline"><span>Bônus</span><b>' + money(r.bonus) + '</b></div>' : '') +
        '<div class="sumline"><span>Vales que você já pegou</span><b style="color:var(--bad)">− ' + money(r.vales) + '</b></div>' +
        (Number(r.descontos) ? '<div class="sumline"><span>Descontos</span><b style="color:var(--bad)">− ' + money(r.descontos) + '</b></div>' : '') +
        '<div class="sumline tot"><span>Você recebe em ' + dday(r.pagamento_em) + '</span><span>' + money(r.liquido) + '</span></div>' +
        '<div class="small mut" style="margin-top:6px">O pagamento de ' + mesTxt(mesSel) + ' cai no 5º dia útil do mês seguinte. O valor muda conforme você produz.</div></div>';
      h += '<div class="card"><h3>Pacotes que você fez em ' + mesTxt(mesSel) + '</h3>' + (r.dias.length ? '<div class="scroll"><table><tr><th>Dia</th><th>Pacotes</th><th>Comissão</th></tr>' + r.dias.map((d) => '<tr><td>' + dday(d.dia) + '</td><td><b>' + d.pacotes + '</b></td><td>' + money(Number(d.pacotes) * Number(r.comissao_pacote)) + '</td></tr>').join('') + '</table></div>' : '<div class="mut">Nenhuma produção registrada neste mês.</div>') + '</div>';
      if (r.lancamentos.length) h += '<div class="card"><h3>Vales e extras</h3><table><tr><th>Dia</th><th>O que</th><th>Valor</th></tr>' + r.lancamentos.map((l) => '<tr><td>' + dday(l.data) + '</td><td>' + TL2[l.tipo] + (l.horas ? ' (' + Number(l.horas) + ' h)' : '') + '</td><td>' + money(l.valor) + '</td></tr>').join('') + '</table></div>';
      $('view').innerHTML = h;
    }
    $('sMes').onchange = (e) => { if (e.target.value) { mesSel = e.target.value; tSalario(); } };
  }

  // ---------- admin: usuários e senhas ----------
  let uBusca = '';
  async function tUsuarios() {
    const l = await rpc('admin_listar_usuarios', { p_busca: uBusca });
    const T = { cliente: ['Cliente', ''], pendente_equipe: ['Aguardando', 'warn'], funcionaria: ['Funcionária', 'ok'], admin: ['Administrador', 'y'], bloqueado: ['Bloqueado', 'bad'] };
    $('view').innerHTML = '<h2>Usuários e senhas</h2><div class="small mut">Aqui você troca a senha de qualquer pessoa: clientes, funcionárias e a sua. Todos entram com <b>nome + senha</b>.</div>' +
      '<input id="uBusca" placeholder="Buscar pelo nome" value="' + esc(uBusca) + '" style="margin:10px 0">' +
      (l.map((u) => '<div class="card"><div class="row"><div class="grow"><b>' + esc(u.nome || '(sem nome)') + '</b><div class="small mut">usuário: ' + esc(AX.userName(u.email)) + '</div></div><span class="tag ' + T[u.role][1] + '">' + T[u.role][0] + '</span>' +
        (u.id === me.id ? '<button class="btn sm sec" data-pw-self="1">Trocar minha senha</button>' : (u.role === 'admin' ? '' : '<button class="btn sm" data-pw="' + u.id + '" data-nome="' + esc(u.nome || AX.userName(u.email)) + '">Trocar senha</button>')) + '</div></div>').join('') || '<div class="card mut">Ninguém encontrado.</div>');
    $('uBusca').oninput = (e) => { uBusca = e.target.value; clearTimeout(tUsuarios.t); tUsuarios.t = setTimeout(async () => { const pos = e.target.selectionStart; await tUsuarios(); const i = $('uBusca'); i.focus(); i.setSelectionRange(pos, pos); }, 350); };
  }
  function senhaModal(userId, nome) {
    const self = !userId;
    modal('<h3>' + (self ? 'Trocar minha senha' : 'Nova senha de ' + esc(nome)) + '</h3><label>Nova senha (mínimo 6 caracteres)</label><input id="sN1" type="password" autocomplete="new-password"><label>Repita a nova senha</label><input id="sN2" type="password" autocomplete="new-password"><div id="sErr"></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn sec grow" id="sNo">Cancelar</button><button class="btn grow" id="sOk">Salvar senha</button></div>' +
      (self ? '' : '<div class="small mut" style="margin-top:8px">Avise a pessoa da nova senha. Ela pode trocar depois em "Minha senha".</div>'));
    $('sNo').onclick = closeModal;
    $('sOk').onclick = act(async () => {
      const a = $('sN1').value, b = $('sN2').value, err = (m) => { $('sErr').innerHTML = '<div class="errbox">' + esc(m) + '</div>'; };
      if (a.length < 6) return err('A senha precisa de pelo menos 6 caracteres.');
      if (a !== b) return err('As duas senhas não são iguais.');
      try {
        if (self) { const { error } = await sb.auth.updateUser({ password: a }); if (error) throw new Error(error.message); }
        else await rpc('admin_trocar_senha', { p_user: userId, p_senha: a });
        closeModal(); toast(self ? 'Sua senha foi trocada.' : 'Senha de ' + nome + ' trocada.', 'ok');
      } catch (e) { err(e.message); }
    });
  }

  // ---------- admin: folha de pagamento ----------
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  let mesSel = new Date().toLocaleDateString('sv-SE').slice(0, 7);          // AAAA-MM
  const mesTxt = (m) => MESES[Number(m.slice(5, 7)) - 1] + ' de ' + m.slice(0, 4);
  const num = (v) => Number(String(v).replace(/\./g, '').replace(',', '.')) || Number(String(v).replace(',', '.')) || 0;
  const numBR = (v) => Number(String(v).replace(',', '.'));
  const mesPicker = (fn) => '<div class="row" style="margin:8px 0"><div class="grow"><label style="margin-top:0">Mês</label><input id="mMes" type="month" value="' + mesSel + '"></div></div>';
  const TL = { vale: 'Vale', hora_extra: 'Hora extra', desconto: 'Desconto', bonus: 'Bônus' };

  async function tFolha() {
    const r = await rpc('financeiro_mes', { p_mes: mesSel + '-01' });
    const lanc = await q(sb.from('lancamentos_folha').select('*').eq('competencia', mesSel + '-01').order('data', { ascending: false }));
    const tot = (k) => r.folha.reduce((x, p) => x + Number(p[k]), 0);
    let h = '<div class="row"><h2 class="grow">Folha de pagamento</h2><button class="btn sm" id="pNova">+ Funcionária</button></div>' + mesPicker() +
      '<div class="kpi" style="margin-bottom:12px"><div><span class="small mut">Salários (base)</span><b>' + money(tot('salario')) + '</b></div><div><span class="small mut">Vales no mês</span><b>' + money(tot('vales')) + '</b></div><div><span class="small mut">Horas extras (valor)</span><b>' + money(tot('he_valor')) + '</b></div><div><span class="small mut">A pagar no 5º dia útil (' + dday(r.pagamento_em) + ')</span><b>' + money(r.folha_liquido) + '</b></div></div>' +
      '<div class="small mut" style="margin-bottom:10px">O pagamento de ' + mesTxt(mesSel) + ' cai no 5º dia útil do mês seguinte (segunda a sexta, sem feriados nacionais fixos). Vales e descontos do mês são abatidos dele.</div>';
    h += r.folha.map((p) => {
      const ls = lanc.filter((l) => l.pessoa_id === p.id);
      return '<div class="card"><div class="row"><h3 class="grow">' + esc(p.nome) + '</h3><button class="btn sm sec" data-ped="' + p.id + '">Editar</button></div>' +
        '<div class="small mut">🕗 ' + esc(p.jornada) + '</div><div class="sumline"><span>Salário base</span><b>' + money(p.salario) + '</b></div>' +
        '<div class="sumline small mut"><span>Valor da hora extra</span><span>' + money(p.valor_hora_extra) + ' por hora</span></div>' +
        '<div class="sumline"><span>Comissão (' + p.pacotes_feitos + ' pacotes × ' + money(p.comissao_pacote) + ')</span><b>' + money(p.comissao) + '</b></div>' +
        '<div class="sumline"><span>Horas extras no mês (' + Number(p.he_horas) + ' h)</span><b>' + money(p.he_valor) + '</b></div>' +
        (Number(p.bonus) ? '<div class="sumline"><span>Bônus</span><b>' + money(p.bonus) + '</b></div>' : '') +
        '<div class="sumline"><span>Vales (já adiantados)</span><b style="color:var(--bad)">− ' + money(p.vales) + '</b></div>' +
        (Number(p.descontos) ? '<div class="sumline"><span>Descontos</span><b style="color:var(--bad)">− ' + money(p.descontos) + '</b></div>' : '') +
        '<div class="sumline tot"><span>Vai receber em ' + dday(r.pagamento_em) + '</span><span>' + money(p.liquido) + '</span></div>' +
        '<div class="row" style="margin-top:8px"><button class="btn sm" data-lf="vale" data-p="' + p.id + '">+ Vale</button><button class="btn sm sec" data-lf="hora_extra" data-p="' + p.id + '">+ Hora extra</button><button class="btn sm sec" data-lf="desconto" data-p="' + p.id + '">+ Desconto</button><button class="btn sm sec" data-lf="bonus" data-p="' + p.id + '">+ Bônus</button></div>' +
        (ls.length ? '<div class="scroll" style="margin-top:8px"><table><tr><th>Dia</th><th>Tipo</th><th>Valor</th><th></th></tr>' + ls.map((l) => '<tr><td>' + dday(l.data) + '</td><td>' + TL[l.tipo] + (l.horas ? ' (' + Number(l.horas) + ' h)' : '') + (l.obs ? '<br><span class="mut small">' + esc(l.obs) + '</span>' : '') + '</td><td>' + money(l.valor) + '</td><td><button class="btn sm sec" data-lfdel="' + l.id + '">Apagar</button></td></tr>').join('') + '</table></div>' : '') + '</div>';
    }).join('') || '<div class="card mut">Nenhuma funcionária cadastrada na folha. Toque em "+ Funcionária".</div>';
    $('view').innerHTML = h;
    $('mMes').onchange = (e) => { if (e.target.value) { mesSel = e.target.value; tFolha(); } };
    $('pNova').onclick = () => pessoaModal(null);
    document.querySelectorAll('[data-ped]').forEach((b) => { b.onclick = () => pessoaModal(r.folha.find((x) => x.id === b.dataset.ped)); });
    document.querySelectorAll('[data-lf]').forEach((b) => { b.onclick = () => lancModal(b.dataset.lf, b.dataset.p, r.folha.find((x) => x.id === b.dataset.p)); });
    document.querySelectorAll('[data-lfdel]').forEach((b) => { b.onclick = act(async () => { if (!(await confirmBox('<h3>Apagar este lançamento?</h3>'))) return; await rpc('remover_lancamento', { p_id: b.dataset.lfdel }); tFolha(); }); });
  }
  async function pessoaModal(p) {
    let logins = []; try { logins = await q(sb.from('profiles').select('id,nome,email,role').in('role', ['funcionaria', 'admin'])); } catch (e) { /* ignore */ }
    const x = p || { nome: '', salario: 1800, horas_mensais: 220, adicional_he: 50 };
    const real = p ? await q(sb.from('pessoal').select('profile_id,ativo').eq('id', p.id).single()) : { profile_id: null, ativo: true };
    modal('<h3>' + (p ? 'Editar' : 'Nova') + ' funcionária</h3><label>Nome</label><input id="fpNome" value="' + esc(x.nome) + '">' +
      '<label>Salário base mensal (R$)</label><input id="fpSal" inputmode="decimal" value="' + String(x.salario).replace('.', ',') + '">' +
      '<label>Horário de trabalho</label><input id="fpJor" value="' + esc(x.jornada || 'Segunda a sexta, das 8h às 18h') + '"><div class="cols"><div><label>Horas por mês</label><input id="fpHoras" type="number" min="1" value="' + x.horas_mensais + '"></div><div><label>Valor da hora extra (R$)</label><input id="fpAd" inputmode="decimal" value="' + String(x.valor_hora_extra == null ? 7 : x.valor_hora_extra).replace('.', ',') + '"></div></div>' +
      '<label>Comissão por pacote produzido (R$)</label><input id="fpCom" inputmode="decimal" value="' + String(x.comissao_pacote == null ? 0.5 : x.comissao_pacote).replace('.', ',') + '"><div class="small mut">A hora extra é paga pelo valor fixo informado acima. A comissão é paga sobre os pacotes que ela registra em Produzir.</div>' +
      '<label>Ligar ao login dela (opcional)</label><select id="fpLogin"><option value="">— sem login —</option>' + logins.map((l) => '<option value="' + l.id + '" ' + (real.profile_id === l.id ? 'selected' : '') + '>' + esc(l.nome || AX.userName(l.email)) + '</option>').join('') + '</select>' +
      (p ? '<label>Situação</label><select id="fpAtivo"><option value="1" ' + (real.ativo ? 'selected' : '') + '>Ativa</option><option value="0" ' + (!real.ativo ? 'selected' : '') + '>Desligada (some da folha)</option></select>' : '') +
      '<div id="fpErr"></div><div class="row" style="margin-top:12px"><button class="btn sec grow" id="fpNo">Cancelar</button><button class="btn grow" id="fpOk">Salvar</button></div>');
    $('fpNo').onclick = closeModal;
    $('fpOk').onclick = act(async () => {
      const err = (m) => { $('fpErr').innerHTML = '<div class="errbox">' + esc(m) + '</div>'; };
      const row = { nome: nz($('fpNome').value), jornada: nz($('fpJor').value) || 'Segunda a sexta, das 8h às 18h', salario: numBR($('fpSal').value), horas_mensais: parseInt($('fpHoras').value, 10), hora_extra_valor: numBR($('fpAd').value), comissao_pacote: numBR($('fpCom').value), profile_id: $('fpLogin').value || null };
      if (row.nome.length < 2) return err('Digite o nome.');
      if (!(row.salario >= 0)) return err('Digite o salário.');
      if (!(row.horas_mensais > 0)) return err('Digite as horas por mês (ex.: 220).');
      if (!(row.hora_extra_valor >= 0)) return err('Digite o valor da hora extra (ex.: 7,00).');
      if (!(row.comissao_pacote >= 0)) return err('Digite a comissão por pacote (ex.: 0,50).');
      if (p) row.ativo = $('fpAtivo').value === '1';
      try { if (p) await q(sb.from('pessoal').update(row).eq('id', p.id)); else await q(sb.from('pessoal').insert(row)); closeModal(); toast('Salvo.', 'ok'); tFolha(); } catch (e) { err(e.message); }
    });
  }
  function lancModal(tipo, pessoaId, p) {
    const he = tipo === 'hora_extra';
    modal('<h3>' + TL[tipo] + ' — ' + esc(p.nome) + '</h3>' +
      (he ? '<label>Horas extras</label><input id="lcH" inputmode="decimal" placeholder="Ex.: 2,5"><div class="small mut">Valor da hora extra: ' + money(p.valor_hora_extra) + '. O sistema calcula o total.</div>' : '<label>Valor (R$)</label><input id="lcV" inputmode="decimal">') +
      '<label>Dia</label><input id="lcD" type="date" value="' + todayStr() + '"><label>Observação (opcional)</label><input id="lcO"><div id="lcErr"></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn sec grow" id="lcNo">Cancelar</button><button class="btn grow" id="lcOk">Lançar</button></div>');
    $('lcNo').onclick = closeModal;
    $('lcOk').onclick = act(async () => {
      try {
        const d = $('lcD').value || todayStr();
        await rpc('lancar_folha', { p_pessoa: pessoaId, p_tipo: tipo, p_competencia: mesSel + '-01', p_valor: he ? null : numBR($('lcV').value), p_horas: he ? numBR($('lcH').value) : null, p_data: d, p_obs: $('lcO').value });
        closeModal(); toast(TL[tipo] + ' lançado.', 'ok'); tFolha();
      } catch (e) { $('lcErr').innerHTML = '<div class="errbox">' + esc(e.message) + '</div>'; }
    });
  }

  // ---------- admin: financeiro (despesas e lucro) ----------
  const CATS = { mercadoria: 'Mercadoria / matéria-prima', embalagem: 'Embalagem', aluguel: 'Aluguel', energia_agua: 'Energia e água', transporte: 'Transporte / combustível', manutencao: 'Manutenção', impostos: 'Impostos e taxas', outros: 'Outros' };
  async function tFinanceiro() {
    const ini = mesSel + '-01', ult = new Date(Number(mesSel.slice(0, 4)), Number(mesSel.slice(5, 7)), 0).toLocaleDateString('sv-SE');
    const r = await rpc('financeiro_mes', { p_mes: ini });
    const ds = await q(sb.from('despesas').select('*').gte('data', ini).lte('data', ult).order('data', { ascending: false }));
    const prods = await q(sb.from('produtos').select('id,nome').order('nome'));
    const vext = await q(sb.from('vendas_externas').select('*').gte('data', ini).lte('data', ult).order('data', { ascending: false }));
    const compras = ds.filter((d) => d.tipo === 'compra'), desps = ds.filter((d) => d.tipo !== 'compra');
    const liq = Number(r.liquido);
    const tabela = (lista, vazio) => lista.length ? '<div class="scroll"><table><tr><th>Dia</th><th>O que</th><th>Valor</th><th></th></tr>' + lista.map((d) => '<tr><td>' + dday(d.data) + '</td><td>' + esc(d.fornecedor ? d.fornecedor + ' — ' : '') + esc(d.descricao) + '<br><span class="mut small">' + esc(CATD[d.categoria] || CATC[d.categoria] || d.categoria) + (d.quantidade_kg ? ' • ' + String(d.quantidade_kg).replace('.', ',') + ' kg' : '') + '</span>' + (d.pago === false ? ' <span class="tag warn">A pagar' + (d.vencimento ? ' até ' + dday(d.vencimento) : '') + '</span>' : '') + '</td><td><b>' + money(d.valor) + '</b></td><td>' +
      (d.foto_path ? '<button class="btn sm sec" data-nota="' + esc(d.foto_path) + '">📎 Nota</button> ' : '') + (d.pago === false ? '<button class="btn sm green" data-fpago="' + d.id + '">Paguei</button> ' : '') + '<button class="btn sm sec" data-ddel="' + d.id + '" data-foto="' + esc(d.foto_path || '') + '">Apagar</button></td></tr>').join('') + '</table></div>' : '<div class="mut">' + vazio + '</div>';
    let h = '<h2>Financeiro</h2>' + mesPicker() +
      '<div class="kpi" style="margin-bottom:12px"><div><span class="small mut">💰 Vendas (BRUTO)</span><b>' + money(r.bruto) + '</b><span class="small mut">' + r.pedidos + ' pedidos • ' + r.pacotes + ' pacotes' + (Number(r.vendas_notas) ? '<br>+ ' + money(r.vendas_notas) + ' de vendas por nota' : '') + '</span></div>' +
      '<div><span class="small mut">🛒 Compras (mercadoria)</span><b>' + money(r.compras) + '</b></div><div><span class="small mut">🧾 Despesas da loja</span><b>' + money(r.despesas) + '</b></div><div><span class="small mut">👩‍🍳 Folha</span><b>' + money(r.folha_custo) + '</b></div>' +
      '<div style="background:' + (liq >= 0 ? '#0d2d1b' : '#3a0f0b') + '"><span class="small mut">LÍQUIDO de ' + mesTxt(mesSel) + '</span><b style="color:' + (liq >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(liq) + '</b></div></div>' +
      '<div class="small mut" style="margin-bottom:10px"><b>Bruto</b> = tudo que as vendas pagas deram (com a taxa de entrega). <b>Líquido</b> = bruto − compras − despesas − folha de pagamento. Pedidos cancelados não entram.' + (Number(r.a_pagar) ? '<br>⚠️ Contas ainda <b>a pagar</b> neste mês: ' + money(r.a_pagar) + '.' : '') + '</div>' +
      '<div class="card" style="border-color:var(--o)"><h3>Lançar compra ou despesa</h3>' +
      '<label class="btn" style="display:block;text-align:center;cursor:pointer;margin:8px 0">📷 Tirar foto da nota / boleto<input id="fFoto" type="file" accept="image/*" capture="environment" style="display:none"></label>' +
      '<div class="small mut" id="ocrMsg">Tire a foto: o sistema reconhece se é compra, conta/boleto ou venda e lança sozinho. Se errar, é só tocar em Desfazer. Ou preencha à mão abaixo.</div><div id="ocrPrev"></div>' +
      '<div class="cols m1"><div><label>É uma...</label><select id="fTipo"><option value="compra">Compra de mercadoria</option><option value="despesa">Despesa da loja (conta, boleto)</option></select></div><div><label>Tipo</label><select id="fCat"></select></div></div>' +
      '<div class="cols m1"><div><label>Fornecedor / quem cobrou</label><input id="fForn" placeholder="Ex.: Frigorífico, Cemig"></div><div><label>Dia</label><input id="fData" type="date" value="' + todayStr() + '"></div></div>' +
      '<label>Descrição</label><input id="fDesc" placeholder="Ex.: 20 kg de coração"><label>Valor (R$)</label><input id="fVal" inputmode="decimal">' +
      '<div id="fCompra" class="cols m1"><div><label>Produto (opcional)</label><select id="fProd"><option value="">— nenhum —</option>' + prods.map((p) => '<option value="' + p.id + '">' + esc(p.nome) + '</option>').join('') + '</select></div><div><label>Peso comprado (kg, opcional)</label><input id="fKg" inputmode="decimal"></div></div>' +
      '<label class="row" style="margin-top:10px"><input type="checkbox" id="fPago" style="width:24px;height:24px" checked> Já está pago</label><div id="fVencBox" class="hide"><label>Vence em</label><input id="fVenc" type="date"></div>' +
      '<div id="dErr"></div><button class="btn" id="dSalvar" style="margin-top:12px">Salvar</button></div>' +
      '<div class="card"><h3>💰 Vendas lançadas por nota <span class="tag">' + money(r.vendas_notas) + '</span></h3>' + (vext.length ? '<div class="scroll"><table><tr><th>Dia</th><th>O que</th><th>Valor</th><th></th></tr>' + vext.map((v) => '<tr><td>' + dday(v.data) + '</td><td>' + esc(v.descricao) + (v.auto ? ' <span class="tag">🤖 auto</span>' : '') + '</td><td><b>' + money(v.valor) + '</b></td><td>' + (v.foto_path ? '<button class="btn sm sec" data-nota="' + esc(v.foto_path) + '">📎 Nota</button> ' : '') + '<button class="btn sm sec" data-vdel="' + v.id + '" data-foto="' + esc(v.foto_path || '') + '">Apagar</button></td></tr>').join('') + '</table></div>' : '<div class="mut">Nenhuma venda lançada por nota. As vendas feitas pela loja online já entram sozinhas no bruto.</div>') + '</div>' +
      '<div class="card"><h3>🛒 Compras do mês <span class="tag">' + money(r.compras) + '</span></h3>' + tabela(compras, 'Nenhuma compra lançada.') + '</div>' +
      '<div class="card"><h3>🧾 Despesas do mês <span class="tag">' + money(r.despesas) + '</span></h3>' + (r.despesas_por_categoria.map((c) => '<div class="sumline"><span>' + esc(CATD[c.categoria] || c.categoria) + '</span><b>' + money(c.total) + '</b></div>').join('')) + tabela(desps, 'Nenhuma despesa lançada.') + '</div>' +
      '<div class="card"><h3>👩‍🍳 Folha do mês</h3>' + (r.folha.map((p) => '<div class="sumline"><span>' + esc(p.nome) + ' <span class="mut small">(vales ' + money(p.vales) + ')</span></span><b>' + money(p.bruto) + '</b></div>').join('') || '<div class="mut">Nenhuma funcionária na folha.</div>') + '<div class="sumline tot"><span>Custo da folha</span><span>' + money(r.folha_custo) + '</span></div><div class="small mut">A pagar no 5º dia útil (' + dday(r.pagamento_em) + '): ' + money(r.folha_liquido) + ' (já descontados os vales).</div></div>';
    $('view').innerHTML = h;
    notaFile = null;
    const catSel = () => { const c = $('fTipo').value === 'compra' ? CATC : CATD; $('fCat').innerHTML = Object.keys(c).map((k) => '<option value="' + k + '">' + c[k] + '</option>').join(''); $('fCompra').classList.toggle('hide', $('fTipo').value !== 'compra'); };
    $('fTipo').onchange = catSel; catSel();
    $('fPago').onchange = () => $('fVencBox').classList.toggle('hide', $('fPago').checked);
    $('mMes').onchange = (e) => { if (e.target.value) { mesSel = e.target.value; tFinanceiro(); } };
    if (notaPend) {
      notaFile = notaPend; notaPend = null;
      $('ocrPrev').innerHTML = '<img src="' + URL.createObjectURL(notaFile) + '" style="max-width:100%;max-height:220px;border-radius:10px;margin:8px 0">';
      if (notaPendD) { aplicarLeitura(notaPendD); notaPendD = null; }
      $('ocrMsg').innerHTML = '⚠️ Confira os campos e toque em Salvar. A foto fica guardada junto.';
      $('fTipo').scrollIntoView();
    }
    $('fFoto').onchange = (e) => { const f = e.target.files[0]; if (f) notaAuto(f, $('ocrPrev'), tFinanceiro); };
    $('dSalvar').onclick = act(async () => {
      const err = (m) => { $('dErr').innerHTML = '<div class="errbox">' + esc(m) + '</div>'; }; $('dErr').innerHTML = '';
      const v = numBR($('fVal').value), pago = $('fPago').checked;
      if (nz($('fDesc').value).length < 2 && nz($('fForn').value).length < 2) return err('Escreva a descrição ou o fornecedor.');
      if (!(v > 0)) return err('Digite o valor, maior que zero.');
      if (!pago && !$('fVenc').value) return err('Informe quando vence.');
      try {
        let foto_path = null;
        if (notaFile) {
          const path = 'n-' + uid() + '.jpg', up = await sb.storage.from('alex-notas').upload(path, await redim(notaFile, 1600), { contentType: 'image/jpeg' });
          if (up.error) throw new Error('Foto: ' + up.error.message); foto_path = path;
        }
        const tipo = $('fTipo').value, kg = numBR($('fKg').value);
        await q(sb.from('despesas').insert({ tipo, categoria: $('fCat').value, descricao: nz($('fDesc').value) || nz($('fForn').value), fornecedor: nz($('fForn').value) || null, valor: v, data: $('fData').value || todayStr(), pago, vencimento: pago ? null : $('fVenc').value, produto_id: tipo === 'compra' && $('fProd').value ? $('fProd').value : null, quantidade_kg: tipo === 'compra' && kg > 0 ? kg : null, foto_path, criado_por: me.id }));
        toast('Lançado.', 'ok'); tFinanceiro();
      } catch (e) { err(e.message); }
    });
    document.querySelectorAll('[data-ddel]').forEach((b) => { b.onclick = act(async () => { if (!(await confirmBox('<h3>Apagar este lançamento?</h3>'))) return; if (b.dataset.foto) await sb.storage.from('alex-notas').remove([b.dataset.foto]); await q(sb.from('despesas').delete().eq('id', b.dataset.ddel)); tFinanceiro(); }); });
    document.querySelectorAll('[data-vdel]').forEach((b) => { b.onclick = act(async () => { if (!(await confirmBox('<h3>Apagar esta venda?</h3>'))) return; if (b.dataset.foto) await sb.storage.from('alex-notas').remove([b.dataset.foto]); await q(sb.from('vendas_externas').delete().eq('id', b.dataset.vdel)); tFinanceiro(); }); });
    document.querySelectorAll('[data-fpago]').forEach((b) => { b.onclick = act(async () => { await q(sb.from('despesas').update({ pago: true }).eq('id', b.dataset.fpago)); toast('Marcado como pago.', 'ok'); tFinanceiro(); }); });
    document.querySelectorAll('[data-nota]').forEach((b) => { b.onclick = act(async () => { const u = await sb.storage.from('alex-notas').createSignedUrl(b.dataset.nota, 600); if (u.error) throw new Error(u.error.message); modal('<h3>Foto da nota</h3><img src="' + esc(u.data.signedUrl) + '" style="max-width:100%;border-radius:10px"><button class="btn sec" id="nFecha" style="margin-top:10px">Fechar</button>'); $('nFecha').onclick = closeModal; }); });
  }
  let notaFile = null;
  const CATC = { mercadoria: 'Mercadoria (carne, frango…)', embalagem: 'Embalagem, palito, gelo' };
  const CATD = { luz: 'Luz (Cemig)', agua: 'Água', aluguel: 'Aluguel', boleto: 'Boleto', transporte: 'Transporte / combustível', manutencao: 'Manutenção', impostos: 'Impostos e taxas', outros: 'Outros' };
  Object.assign(CATD, { energia_agua: 'Energia e água' });
  const redim = (file, max) => new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob((b) => (b ? res(b) : rej(new Error('Imagem inválida.'))), 'image/jpeg', 0.9); };
    img.onerror = () => rej(new Error('Não consegui abrir a imagem.')); img.src = url;
  });
  // leitura automática da nota (OCR no próprio aparelho, sem enviar a foto para terceiros)
  const loadTess = () => new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('leitor indisponível')); document.head.appendChild(sc);
  });
  async function ocrTexto(blob) {
    await loadTess();
    const { data } = await window.Tesseract.recognize(blob, 'por', { logger: (m) => { const el = $('ocrMsg'); if (el && m.status === 'recognizing text') el.textContent = 'Lendo a nota… ' + Math.round((m.progress || 0) * 100) + '%'; } });
    return data.text || '';
  }
  function lerNota(texto) {
    const t = String(texto || ''), linhas = t.split(/\n/).map((x) => x.trim()).filter(Boolean), up = t.toUpperCase();
    const reg = /(\d{1,3}(?:\.\d{3})*,\d{2})/g, num = (x) => Number(x.replace(/\./g, '').replace(',', '.'));
    let valor = null;
    for (const l of linhas) { if (/(valor\s*(total|a\s*pagar|do\s*documento|cobrado)|total\s*(a\s*pagar|geral|da\s*nota|r\$)?|a\s*pagar)/i.test(l)) { const m = [...l.matchAll(reg)].pop(); if (m) valor = num(m[1]); } }
    if (valor == null) { const todos = [...t.matchAll(reg)].map((m) => num(m[1])).filter((v) => v > 0 && v < 1e6); if (todos.length) valor = Math.max(...todos); }
    let data = null; const md = t.match(/(\d{2})[\/.\-](\d{2})[\/.\-](20\d{2})/);
    if (md && Number(md[2]) >= 1 && Number(md[2]) <= 12 && Number(md[1]) >= 1 && Number(md[1]) <= 31) data = md[3] + '-' + md[2] + '-' + md[1];
    let vencimento = null; const mv = t.match(/vencimento[^\d]{0,12}(\d{2})[\/.\-](\d{2})[\/.\-](20\d{2})/i);
    if (mv) vencimento = mv[3] + '-' + mv[2] + '-' + mv[1];
    let fornecedor = null;
    const ic = linhas.findIndex((l) => /cnpj/i.test(l));
    const cand = (ic > 0 ? linhas.slice(0, ic) : linhas).reverse().find((l) => /[A-Za-zÀ-ú]{4,}/.test(l) && !/(cnpj|cupom|nota|documento|fiscal|danfe)/i.test(l) && l.length < 60);
    if (cand) fornecedor = cand.replace(/[^A-Za-zÀ-ú0-9 .&\-]/g, '').trim().slice(0, 60);
    let categoria = null, tipo = null, cliente = null;
    const topo = linhas.slice(0, 5).join(' ').toUpperCase();
    if (/ESPETINHOS?\s*(DO\s*|DE\s*)?ALEX/.test(topo) || /NOTA\s*DE\s*VENDA|COMPROVANTE\s*DE\s*VENDA|RECIBO\s*DE\s*VENDA|PEDIDO\s*DE\s*VENDA/.test(up)) {
      tipo = 'venda'; categoria = 'venda'; fornecedor = null;
      for (const l of linhas) { const mc = l.match(/(?:cliente|destinat[aá]rio|comprador)\s*[:\-]?\s*(.{3,60})/i); if (mc) { cliente = mc[1].replace(/[^A-Za-zÀ-ú0-9 .&\-]/g, '').trim(); break; } }
    }
    else if (/CEMIG|ENERGIA\s*EL[EÉ]TRICA|ENERGIA/.test(up)) { categoria = 'luz'; tipo = 'despesa'; if (!fornecedor || /BOLETO/.test(fornecedor.toUpperCase())) fornecedor = 'Cemig'; }
    else if (/COPASA|SAAE|SANEAMENTO|\b[AÁ]GUA\b/.test(up)) { categoria = 'agua'; tipo = 'despesa'; }
    else if (/ALUGUEL|LOCA[CÇ][AÃ]O/.test(up)) { categoria = 'aluguel'; tipo = 'despesa'; }
    else if (/BOLETO|LINHA\s*DIGIT[AÁ]VEL|BENEFICI[AÁ]RIO/.test(up)) { categoria = 'boleto'; tipo = 'despesa'; }
    else if (/CARNE|FRANGO|CORA[CÇ][AÃ]O|BOVINO|SU[IÍ]NO|PEIXE|TIL[AÁ]PIA|LINGUI[CÇ]A|\bKG\b|FRIGOR[IÍ]FICO|A[CÇ]OUGUE/.test(up)) { categoria = 'mercadoria'; tipo = 'compra'; }
    else if (/EMBALAGEM|PALITO|BAMBU|SACO|GELO/.test(up)) { categoria = 'embalagem'; tipo = 'compra'; }
    if (categoria === 'luz') fornecedor = 'Cemig';
    else if (categoria === 'agua') fornecedor = (up.match(/COPASA|SAAE|SANEAMENTO/) || ['Conta de água'])[0].replace(/^COPASA$/, 'Copasa');
    else if (categoria === 'boleto') { const mb = t.match(/benefici[aá]rio\s*[:\-]?\s*([^\n]{3,50})/i); fornecedor = mb ? mb[1].replace(/[^A-Za-zÀ-ú0-9 .&\-]/g, '').trim() : null; }
    else if (fornecedor && /(total|valor|vencimento|pagar|r\$)/i.test(fornecedor)) fornecedor = null;
    return { valor, data, vencimento: (tipo === 'despesa' && vencimento) ? vencimento : null, fornecedor, categoria, tipo, cliente };
  }

  // ---------- foto da nota: reconhece, separa e lança sozinho ----------
  let notaPend = null, notaPendD = null;
  const aplicarLeitura = (d) => {
    if (!d) return;
    if (d.tipo && d.tipo !== 'venda') { $('fTipo').value = d.tipo; $('fTipo').onchange(); }
    if (d.categoria && $('fCat').querySelector('option[value="' + d.categoria + '"]')) $('fCat').value = d.categoria;
    if (d.valor != null) $('fVal').value = String(d.valor.toFixed(2)).replace('.', ',');
    if (d.data) $('fData').value = d.data;
    if (d.fornecedor) $('fForn').value = d.fornecedor;
    if (d.vencimento) { $('fPago').checked = false; $('fVencBox').classList.remove('hide'); $('fVenc').value = d.vencimento; }
  };
  // o Alexandre marca o que é a nota (compra / despesa / venda) ou deixa em automático
  let notaUlt = '';
  const NTIPOS = [['compra', '🛒 Compra de mercadoria'], ['despesa', '🧾 Despesa / conta / boleto'], ['venda', '💰 Venda'], ['', '🤖 Não sei (automático)']];
  async function notaAuto(f, box, depois) {
    // 1) depois da foto, pergunta o que é a nota
    box.innerHTML = '<div class="card" style="border-color:var(--o)"><img src="' + URL.createObjectURL(f) + '" style="max-width:100%;max-height:200px;border-radius:10px"><h3 style="margin-top:8px">O que é esta nota?</h3><div style="display:grid;gap:8px">' + NTIPOS.map((t) => '<button type="button" class="btn' + (t[0] ? '' : ' sec') + '" data-ntipo="' + t[0] + '">' + t[1] + '</button>').join('') + '</div></div>';
    const forca = await new Promise((res) => box.querySelectorAll('[data-ntipo]').forEach((x) => { x.onclick = () => res(x.dataset.ntipo); }));
    // 2) lê o valor e lança
    box.innerHTML = '<div class="card"><img src="' + URL.createObjectURL(f) + '" style="max-width:100%;max-height:200px;border-radius:10px"><div class="small mut" id="ocrMsg" style="margin-top:6px">Lendo o valor da nota… (pode levar alguns segundos)</div></div>';
    let d = null;
    try { d = lerNota(await ocrTexto(await redim(f, 1800))); } catch (e) { d = null; }
    if (forca) {
      d = d || { valor: null, data: null, vencimento: null, fornecedor: null, categoria: null, tipo: null, cliente: null };
      d.tipo = forca;
      if (forca === 'venda') { d.categoria = 'venda'; d.fornecedor = null; d.vencimento = null; }
      else if (forca === 'compra' && !CATC[d.categoria]) d.categoria = 'mercadoria';
      else if (forca === 'despesa' && !CATD[d.categoria]) d.categoria = 'outros';
      if (forca !== 'despesa') d.vencimento = null;
    }
    if (!d || !d.tipo || !(d.valor > 0) || d.valor > 100000) {
      if (forca === 'venda') {
        box.innerHTML = '<div class="card"><div class="warn">Não consegui ler o valor da venda. Digite abaixo:</div><label>Valor (R$)</label><input id="nvV" inputmode="decimal"><label>Cliente (opcional)</label><input id="nvC"><div id="nvE"></div><button class="btn" id="nvOk" style="margin-top:10px">Lançar venda</button></div>';
        $('nvOk').onclick = act(async () => { const v = numBR($('nvV').value); if (!(v > 0)) { $('nvE').innerHTML = '<div class="errbox">Digite o valor.</div>'; return; } d.valor = v; d.cliente = nz($('nvC').value) || d.cliente; await gravarNota(d, f, box, depois); });
        return;
      }
      notaPend = f; notaPendD = d;
      box.innerHTML = '<div class="warn">⚠️ Não tive certeza do valor/tipo dessa nota' + (d && d.valor > 0 ? ' (achei ' + money(d.valor) + ')' : '') + '. Abri o formulário já com o que consegui ler: confira e salve. <b>A foto fica guardada.</b></div>';
      go('financeiro'); return;
    }
    await gravarNota(d, f, box, depois);
  }
  async function gravarNota(d, f, box, depois) {
    try {
      const path = 'n-' + uid() + '.jpg', up = await sb.storage.from('alex-notas').upload(path, await redim(f, 1600), { contentType: 'image/jpeg' });
      if (up.error) throw new Error('Foto: ' + up.error.message);
      const dia = d.data || todayStr(); let tab, row, txt;
      if (d.tipo === 'venda') {
        tab = 'vendas_externas'; row = { data: dia, descricao: 'Venda (nota)' + (d.cliente ? ' — ' + d.cliente : ''), cliente: d.cliente || null, valor: d.valor, foto_path: path, auto: true, criado_por: me.id };
        txt = '💰 <b>VENDA</b> de ' + money(d.valor) + (d.cliente ? ' para ' + esc(d.cliente) : '') + ' — somei nas vendas (bruto) de ' + dday(dia) + '.';
      } else {
        const pago = !d.vencimento; tab = 'despesas';
        row = { tipo: d.tipo, categoria: d.categoria, descricao: nz(d.fornecedor) || (CATD[d.categoria] || CATC[d.categoria] || 'Nota'), fornecedor: d.fornecedor || null, valor: d.valor, data: dia, pago, vencimento: d.vencimento || null, foto_path: path, auto: true, criado_por: me.id };
        txt = (d.tipo === 'compra' ? '🛒 <b>COMPRA</b> (' : '🧾 <b>DESPESA</b> (') + esc(CATD[d.categoria] || CATC[d.categoria] || d.categoria) + ') de ' + money(d.valor) + (d.fornecedor ? ' — ' + esc(d.fornecedor) : '') + (pago ? '' : ', <b>a pagar</b> até ' + dday(d.vencimento)) + ' — lancei no Financeiro em ' + dday(dia) + '.';
      }
      const ins = await q(sb.from(tab).insert(row).select('id'));
      notaUlt = txt;
      box.innerHTML = '<div class="card" style="border-color:var(--ok)">✅ ' + txt + '<div class="small mut" style="margin-top:6px">Se a leitura errou, toque em Desfazer.</div><div class="row" style="margin-top:8px"><button class="btn sm sec grow" id="nDes">Desfazer</button><button class="btn sm grow" data-go="financeiro">Ver no Financeiro</button></div></div>';
      $('nDes').onclick = act(async () => { await q(sb.from(tab).delete().eq('id', ins[0].id)); await sb.storage.from('alex-notas').remove([path]); toast('Lançamento desfeito.', 'ok'); depois(); });
      toast('Nota lançada automaticamente.', 'ok');
    } catch (e) { box.innerHTML = '<div class="errbox">' + esc(e.message) + '</div>'; }
  }

  // ---------- admin: lucro por produto ----------
  async function tLucro() {
    const ini = mesSel + '-01', ult = new Date(Number(mesSel.slice(0, 4)), Number(mesSel.slice(5, 7)), 0).toLocaleDateString('sv-SE');
    const r = await rpc('lucro_produtos', { p_ini: ini, p_fim: ult });
    const lista = r.produtos.filter((p) => p.ativo);
    const sem = lista.filter((p) => p.custo_mercadoria == null).length;
    let h = '<h2>Lucro por produto</h2>' + mesPicker() + '<div class="kpi" style="margin-bottom:10px"><div><span class="small mut">Vendido no mês</span><b>' + money(r.receita_total) + '</b></div><div style="background:' + (Number(r.lucro_total) >= 0 ? '#0d2d1b' : '#3a0f0b') + '"><span class="small mut">Lucro dos produtos vendidos</span><b style="color:' + (Number(r.lucro_total) >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(r.lucro_total) + '</b></div></div>' +
      '<div class="small mut" style="margin-bottom:10px">Lucro do pacote = preço − custo da mercadoria − comissão (' + money(r.comissao_pacote) + ' por pacote). O custo considera a <b>perda na limpeza</b> (ex.: comprou 20 kg e sobraram 15 kg).' + (sem ? '<br>⚠️ ' + sem + ' produto(s) ainda sem custo cadastrado: o lucro deles não entra na conta.' : '') + '</div>';
    h += lista.map((p) => {
      const ct = p.custo_mercadoria != null, m = p.margem_pct == null ? null : Number(p.margem_pct);
      const tag = !ct ? '<span class="tag warn">Sem custo</span>' : m < 0 ? '<span class="tag bad">PREJUÍZO</span>' : m < 20 ? '<span class="tag warn">Margem baixa</span>' : '<span class="tag ok">Dá lucro</span>';
      return '<div class="card"><div class="row"><h3 class="grow">' + esc(p.nome) + '</h3>' + tag + '</div><div class="sumline"><span>Preço do pacote</span><b>' + money(p.preco_pacote) + '</b></div>' +
        (ct ? '<div class="sumline"><span>Custo da mercadoria</span><span>' + money(p.custo_mercadoria) + '</span></div><div class="sumline"><span>Comissão da funcionária</span><span>' + money(p.comissao) + '</span></div>' +
          '<div class="sumline tot"><span>Lucro por pacote</span><span style="color:' + (Number(p.lucro_pacote) >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(p.lucro_pacote) + ' (' + String(m).replace('.', ',') + '%)</span></div>' +
          '<div class="small mut">Vendidos no mês: <b>' + p.vendidos + '</b> pacotes → lucro de <b>' + money(p.lucro_total) + '</b></div>' : '<div class="small mut">Cadastre quanto custa a mercadoria para ver o lucro.</div>') +
        '<button class="btn sm ' + (ct ? 'sec' : '') + '" style="margin-top:8px" data-custo="' + p.id + '">' + (ct ? 'Editar custo' : 'Cadastrar custo') + '</button></div>';
    }).join('') || '<div class="card mut">Nenhum produto.</div>';
    $('view').innerHTML = h;
    $('mMes').onchange = (e) => { if (e.target.value) { mesSel = e.target.value; tLucro(); } };
    document.querySelectorAll('[data-custo]').forEach((b) => { b.onclick = () => custoModal(lista.find((x) => x.id === b.dataset.custo), r.comissao_pacote); });
  }
  function custoModal(p, com) {
    const c = p.custo || {}, v = (x) => (x == null ? '' : String(x).replace('.', ','));
    modal('<h3>Custo — ' + esc(p.nome) + '</h3><div class="small mut">Preencha com a última compra. O sistema calcula quanto custa cada pacote já descontando o que se perde na limpeza.</div>' +
      '<div class="cols m1"><div><label>Comprou (kg)</label><input id="cK" inputmode="decimal" placeholder="20" value="' + v(c.compra_kg) + '"></div><div><label>Pagou (R$)</label><input id="cV" inputmode="decimal" value="' + v(c.compra_valor) + '"></div></div>' +
      '<div class="cols m1"><div><label>Depois de limpar sobrou (kg)</label><input id="cL" inputmode="decimal" placeholder="15" value="' + v(c.limpo_kg) + '"></div><div><label>Cada pacote leva (kg limpo)</label><input id="cP" inputmode="decimal" placeholder="0,5" value="' + v(c.kg_por_pacote) + '"></div></div>' +
      '<label>Outros custos por pacote (palito, embalagem, gelo, gás) — R$</label><input id="cO" inputmode="decimal" value="' + v(c.outros_custos == null ? 0 : c.outros_custos) + '">' +
      '<label>OU custo da mercadoria por pacote, direto (R$) — deixe vazio para usar a conta acima</label><input id="cM" inputmode="decimal" value="' + v(c.custo_manual) + '">' +
      '<div class="card" id="cPrev" style="margin-top:10px"></div><div id="cErr"></div><div class="row" style="margin-top:10px"><button class="btn sec grow" id="cNo">Cancelar</button><button class="btn grow" id="cOk">Salvar custo</button></div>');
    const n = (id) => { const x = numBR($(id).value); return isNaN(x) ? 0 : x; };
    const calc = () => {
      const K = n('cK'), V = n('cV'), L = n('cL'), P = n('cP'), O = n('cO'), M = $('cM').value.trim() === '' ? null : n('cM');
      const merc = M != null ? M : (K > 0 && L > 0 && P > 0 ? V / L * P : null);
      if (merc == null) { $('cPrev').innerHTML = '<span class="mut">Preencha os campos para ver o custo do pacote.</span>'; return null; }
      const perda = K > 0 && L > 0 ? Math.round((1 - L / K) * 100) : null, total = merc + O, luc = Number(p.preco_pacote) - total - Number(com);
      $('cPrev').innerHTML = (perda != null && M == null ? '<div class="small mut">Perda na limpeza: <b>' + perda + '%</b> • custo por kg limpo: <b>' + money(V / L) + '</b></div>' : '') +
        '<div class="sumline"><span>Custo da mercadoria por pacote</span><b>' + money(merc + O) + '</b></div><div class="sumline"><span>Comissão</span><span>' + money(com) + '</span></div><div class="sumline tot"><span>Lucro por pacote</span><span style="color:' + (luc >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(luc) + ' (' + Math.round(luc / Number(p.preco_pacote) * 100) + '%)</span></div>';
      return true;
    };
    ['cK', 'cV', 'cL', 'cP', 'cO', 'cM'].forEach((id) => { $(id).oninput = calc; }); calc();
    $('cNo').onclick = closeModal;
    $('cOk').onclick = act(async () => {
      if (!calc()) { $('cErr').innerHTML = '<div class="errbox">Preencha os campos para calcular.</div>'; return; }
      const M = $('cM').value.trim() === '' ? null : n('cM');
      try { await q(sb.from('custos_produto').upsert({ produto_id: p.id, compra_kg: n('cK') || null, compra_valor: $('cV').value.trim() === '' ? null : n('cV'), limpo_kg: n('cL') || null, kg_por_pacote: n('cP') || null, outros_custos: n('cO'), custo_manual: M, atualizado_em: new Date().toISOString() }, { onConflict: 'produto_id' })); closeModal(); toast('Custo salvo.', 'ok'); tLucro(); }
      catch (e) { $('cErr').innerHTML = '<div class="errbox">' + esc(e.message) + '</div>'; }
    });
  }

  // ---------- admin: entrega / configurações ----------
  let regs = [];
  async function tEntrega() {
    const c = await q(sb.from('config').select('*').eq('id', 1).single()); cfgCache = c; regs = (c.regioes || []).map((r) => ({ ...r, bairros: (r.bairros || []).join(', ') }));
    paintEntrega();
  }
  function paintEntrega() {
    const c = cfgCache, d = c.desconto || {}, hz = c.horarios || {};
    const rrows = regs.map((r, i) => '<div class="card" style="background:var(--card2)"><div class="cols m1"><div><label>Nome da região</label><input data-r="nome" data-i="' + i + '" value="' + esc(r.nome || '') + '"></div><div><label>Cidade</label><input data-r="cidade" data-i="' + i + '" value="' + esc(r.cidade || '') + '"></div></div>' +
      '<label>Bairros atendidos (separe por vírgula; vazio = cidade inteira)</label><input data-r="bairros" data-i="' + i + '" value="' + esc(r.bairros) + '">' +
      '<div class="cols"><div><label>Taxa de entrega (R$)</label><input data-r="taxa" data-i="' + i + '" inputmode="decimal" value="' + esc(r.taxa == null ? '' : String(r.taxa).replace('.', ',')) + '"></div><div><label>Prazo extra (min)</label><input data-r="prazo_extra_min" data-i="' + i + '" type="number" min="0" value="' + (r.prazo_extra_min || 0) + '"></div></div>' +
      '<button class="btn sm sec" style="margin-top:8px" data-rdel="' + i + '">Remover região</button></div>').join('');
    const hrows = [1, 2, 3, 4, 5, 6, 0].map((k) => { const x = hz[k] || { ativo: false, de: '09:00', ate: '18:00' }; return '<div class="hrs"><b>' + DIAS[k] + '</b><input type="checkbox" data-h="ativo" data-k="' + k + '" ' + (x.ativo ? 'checked' : '') + '><input type="time" data-h="de" data-k="' + k + '" value="' + x.de + '"><input type="time" data-h="ate" data-k="' + k + '" value="' + x.ate + '"></div>'; }).join('');
    $('view').innerHTML = '<h2>Entrega e loja</h2><div class="warn small">O sistema só cobra e entrega onde você cadastrar aqui. Nenhuma região, taxa, prazo ou desconto é inventado: confira tudo antes de divulgar o link.</div>' +
      '<div class="card"><h3>Loja</h3><div class="cols m1"><div><label>Nome da loja</label><input id="eNome" value="' + esc(c.loja_nome) + '"></div><div><label>WhatsApp da loja</label><input id="eZap" value="' + esc(c.whatsapp || '') + '" inputmode="tel"></div></div>' +
      '<div class="cols m1"><div><label>Prazo de preparação (minutos)</label><input id="ePrazo" type="number" min="0" value="' + c.prazo_preparo_min + '"></div><div><label>Pedido mínimo (R$, 0 = sem mínimo)</label><input id="eMin" inputmode="decimal" value="' + String(c.pedido_minimo).replace('.', ',') + '"></div></div>' +
      '<label>Tempo de reserva do estoque durante o pagamento (minutos, 30 a 240)</label><input id="eRes" type="number" min="30" max="240" value="' + c.reserva_minutos + '"></div>' +
      '<div class="card"><h3>Desconto por quantidade (opcional)</h3><label class="row"><input type="checkbox" id="dAtivo" style="width:24px;height:24px" ' + (d.ativo ? 'checked' : '') + '> Ativar desconto</label><div class="cols"><div><label>A partir de (pacotes)</label><input id="dMin" type="number" min="1" value="' + (d.min_pacotes || 10) + '"></div><div><label>Desconto (%)</label><input id="dPct" inputmode="decimal" value="' + String(d.percentual == null ? 5 : d.percentual).replace('.', ',') + '"></div></div></div>' +
      '<div class="card"><h3>Regiões atendidas e taxas</h3><div class="small mut">A primeira região que combinar com o endereço vale. Coloque as de bairro específico antes das de cidade inteira.</div>' + rrows + '<button class="btn sec" style="margin-top:8px" id="rAdd">+ Adicionar região</button></div>' +
      '<div class="card"><h3>Dias e horários de entrega</h3><div class="hrs small mut"><span>Dia</span><span>Entrega</span><span>De</span><span>Até</span></div>' + hrows + '</div><div id="eErr"></div><button class="btn" id="eSave">Salvar configurações</button>';
  }
  function readRegs() { document.querySelectorAll('[data-r]').forEach((el) => { regs[el.dataset.i][el.dataset.r] = el.value; }); }
  async function saveEntrega() {
    readRegs();
    const err = (m) => { $('eErr').innerHTML = '<div class="errbox">' + esc(m) + '</div>'; window.scrollTo(0, document.body.scrollHeight); };
    const num = (s) => Number(String(s).replace(',', '.'));
    const regioes = [];
    for (const r of regs) {
      if (!nz(r.cidade)) return err('Toda região precisa de uma cidade.');
      const t = num(r.taxa); if (r.taxa === '' || isNaN(t) || t < 0) return err('Informe a taxa de entrega da região "' + (r.nome || r.cidade) + '" (use 0 só se a entrega for realmente grátis).');
      regioes.push({ nome: nz(r.nome) || nz(r.cidade), cidade: nz(r.cidade), bairros: String(r.bairros || '').split(',').map((x) => x.trim()).filter(Boolean), taxa: t, prazo_extra_min: Number(r.prazo_extra_min) || 0 });
    }
    const horarios = {};
    for (let k = 0; k < 7; k++) {
      const g = (n) => document.querySelector('[data-h="' + n + '"][data-k="' + k + '"]');
      const x = { ativo: g('ativo').checked, de: g('de').value || '09:00', ate: g('ate').value || '18:00' };
      if (x.ativo && x.de >= x.ate) return err('Horário inválido em ' + DIAS[k] + ': o início deve ser antes do fim.');
      horarios[k] = x;
    }
    const res = Number($('eRes').value); if (!(res >= 30 && res <= 240)) return err('A reserva deve ficar entre 30 e 240 minutos.');
    const dp = num($('dPct').value); if ($('dAtivo').checked && !(dp > 0 && dp < 100)) return err('Informe um percentual de desconto entre 0 e 100.');
    const row = { loja_nome: nz($('eNome').value) || 'Espetinhos Alex', whatsapp: nz($('eZap').value), prazo_preparo_min: Number($('ePrazo').value) || 0, pedido_minimo: num($('eMin').value) || 0, reserva_minutos: res, regioes, horarios, desconto: { ativo: $('dAtivo').checked, min_pacotes: Number($('dMin').value) || 10, percentual: dp || 0 }, atualizado_em: new Date().toISOString() };
    await q(sb.from('config').update(row).eq('id', 1));
    toast('Configurações salvas.', 'ok'); tEntrega();
  }

  // ---------- admin: pagamentos ----------
  async function tPagto() {
    const c = await q(sb.from('config').select('pagamento').eq('id', 1).single()), pg = c.pagamento || {}, mn = pg.manual || {};
    $('view').innerHTML = '<h2>Pagamentos</h2><p class="mut">Verificando o provedor…</p>';
    let st = null, falha = '';
    try {
      const { data } = await sb.auth.getSession();
      const r = await fetch(AX.cfg.SUPABASE_URL + '/functions/v1/alex-status', { method: 'POST', headers: { Authorization: 'Bearer ' + data.session.access_token, apikey: AX.cfg.SUPABASE_ANON_KEY } });
      if (r.status === 404) falha = 'As funções de pagamento ainda não foram publicadas no Supabase.'; else st = await r.json();
    } catch (e) { falha = 'Não foi possível consultar o provedor.'; }
    const ok = (b) => (b ? '✅' : '❌');
    const pronto = st && st.token && st.token_valido && st.webhook_secret;
    $('view').innerHTML = '<h2>Pagamentos</h2>' +
      (pg.ativo ? '<div class="okbox">Pagamento online <b>ATIVO</b>.' + (st && st.modo_teste ? ' <b>Atenção: o token parece ser de TESTE.</b>' : '') + '</div>' : '<div class="warn"><b>O pagamento automático (Mercado Pago) não está ativo.</b> ' + (mn.ativo ? 'Os clientes podem comprar pelo pagamento direto abaixo.' : 'Ative o pagamento direto abaixo para a loja já aceitar pedidos.') + '</div>') +
      '<div class="card"><h3>Situação da integração (Mercado Pago)</h3>' + (falha ? '<div class="warn">' + esc(falha) + '</div>' : '<div>' + ok(st.token) + ' Token de acesso (MP_ACCESS_TOKEN) configurado<br>' + ok(st.token_valido) + ' Token aceito pelo provedor' + (st.conta ? ' (conta: ' + esc(st.conta) + ')' : '') + '<br>' + ok(st.webhook_secret) + ' Chave secreta do webhook (MP_WEBHOOK_SECRET) configurada</div>') +
      '<div class="small mut" style="margin-top:10px">URL do webhook para cadastrar no painel do Mercado Pago (evento "Pagamentos"):</div><div class="copia">' + esc(st ? st.webhook_url : AX.cfg.SUPABASE_URL + '/functions/v1/webhook') + '</div></div>' +
      '<div class="card"><h3>Formas de pagamento</h3><label>Chave pública do Mercado Pago (Public Key — usada no formulário do cartão)</label><input id="gKey" value="' + esc(pg.public_key || '') + '" placeholder="APP_USR-...">' +
      '<label class="row" style="margin-top:12px"><input type="checkbox" id="gPix" style="width:24px;height:24px" ' + (pg.pix !== false ? 'checked' : '') + '> Aceitar Pix</label><label class="row"><input type="checkbox" id="gCartao" style="width:24px;height:24px" ' + (pg.cartao !== false ? 'checked' : '') + '> Aceitar cartão</label>' +
      '<label class="row" style="margin-top:12px"><input type="checkbox" id="gAtivo" style="width:24px;height:24px" ' + (pg.ativo ? 'checked' : '') + '> <b>Ativar pagamento online na loja</b></label>' +
      (pronto ? '' : '<div class="warn small" style="margin-top:8px">Só é possível ativar depois que o token e o webhook estiverem configurados.</div>') + '<div id="gErr"></div><button class="btn" id="gSave" style="margin-top:12px">Salvar</button></div>' +
      '<div class="card small"><h3>Como configurar</h3>1. No Mercado Pago Developers, crie uma aplicação e copie o <b>Access Token</b> e a <b>Public Key</b>.<br>2. No Supabase › Edge Functions › Secrets, crie <b>MP_ACCESS_TOKEN</b> e <b>MP_WEBHOOK_SECRET</b> (a chave secreta gerada ao cadastrar o webhook).<br>3. Cadastre a URL do webhook acima no painel do Mercado Pago.<br>4. Volte aqui, confira os ✅ e ative. Teste primeiro com credenciais de teste.<br>O Pix e o cartão só viram "pago" quando o Mercado Pago confirma pela conexão segura (webhook assinado). O botão "já paguei" não existe.</div>';
    $('view').insertAdjacentHTML('afterbegin', '<div class="card" style="border-color:var(--o)"><h3>💵 Pagamento direto (sem gateway)</h3><div class="small mut">O cliente escolhe como vai pagar direto para a loja. Quando você receber, abre o pedido em "Todos os pedidos" e toca em <b>Confirmar pagamento recebido</b>: ele aparece como pago e vai para a equipe.</div>' +
      '<label class="row" style="margin-top:12px"><input type="checkbox" id="mAtivo" style="width:24px;height:24px" ' + (mn.ativo ? 'checked' : '') + '> <b>Aceitar pagamento direto</b></label>' +
      '<label>Chave Pix da loja (celular, CPF/CNPJ, e-mail ou chave aleatória)</label><input id="mChave" value="' + esc(mn.pix_chave || '') + '"><label>Nome do titular da chave</label><input id="mNome" value="' + esc(mn.pix_nome || '') + '">' +
      '<label class="row" style="margin-top:10px"><input type="checkbox" id="mDin" style="width:24px;height:24px" ' + (mn.dinheiro !== false ? 'checked' : '') + '> Aceitar dinheiro na entrega</label><label class="row"><input type="checkbox" id="mMaq" style="width:24px;height:24px" ' + (mn.maquininha !== false ? 'checked' : '') + '> Aceitar cartão na maquininha (na entrega)</label>' +
      '<div id="mErr"></div><button class="btn" id="mSave" style="margin-top:12px">Salvar pagamento direto</button></div>');
    $('mSave').onclick = act(async () => {
      const ativo = $('mAtivo').checked, chave = nz($('mChave').value);
      if (ativo && !chave && !$('mDin').checked && !$('mMaq').checked) { $('mErr').innerHTML = '<div class="errbox">Informe a chave Pix ou marque dinheiro/maquininha.</div>'; return; }
      const fresh = (await q(sb.from('config').select('pagamento').eq('id', 1).single())).pagamento || {};
      await q(sb.from('config').update({ pagamento: { ...fresh, manual: { ativo, pix_chave: chave, pix_nome: nz($('mNome').value), dinheiro: $('mDin').checked, maquininha: $('mMaq').checked } }, atualizado_em: new Date().toISOString() }).eq('id', 1));
      toast('Pagamento direto salvo.', 'ok'); tPagto();
    });
    $('gSave').onclick = act(async () => {
      const ativo = $('gAtivo').checked;
      if (ativo && !pronto) { $('gErr').innerHTML = '<div class="errbox">Configure o token e o webhook antes de ativar.</div>'; return; }
      if (ativo && $('gCartao').checked && !nz($('gKey').value)) { $('gErr').innerHTML = '<div class="errbox">Informe a chave pública para aceitar cartão (ou desmarque cartão).</div>'; return; }
      await q(sb.from('config').update({ pagamento: { provedor: 'mercadopago', public_key: nz($('gKey').value), pix: $('gPix').checked, cartao: $('gCartao').checked, ativo, manual: ((await q(sb.from('config').select('pagamento').eq('id', 1).single())).pagamento || {}).manual || {} }, atualizado_em: new Date().toISOString() }).eq('id', 1));
      toast('Salvo.', 'ok'); tPagto();
    });
  }

  // ---------- admin: relatórios ----------
  async function tRelat() {
    const hoje = todayStr(), ini = hoje.slice(0, 8) + '01';
    $('view').innerHTML = '<h2>Relatórios</h2><div class="cols m1"><div><label>De</label><input id="rIni" type="date" value="' + ini + '"></div><div><label>Até</label><input id="rFim" type="date" value="' + hoje + '"></div></div><button class="btn sm" style="margin:10px 0" id="rGo">Atualizar</button><div id="rOut"></div>';
    const run = async () => {
      const r = await rpc('relatorio', { p_ini: $('rIni').value, p_fim: $('rFim').value });
      $('rOut').innerHTML = '<div class="kpi"><div><span class="small mut">Pedidos pagos</span><b>' + r.vendas.pedidos + '</b></div><div><span class="small mut">Faturamento</span><b>' + money(r.vendas.total) + '</b></div><div><span class="small mut">Pacotes vendidos</span><b>' + r.vendas.pacotes + '</b><span class="small mut">' + eq(r.vendas.pacotes) + '</span></div><div><span class="small mut">Perdas/avarias (pacotes)</span><b>' + r.perdas + '</b></div><div><span class="small mut">Reembolsos pendentes</span><b>' + r.reembolsos_pendentes + '</b></div><div><span class="small mut">Pendências</span><b>' + r.pendencias + '</b></div></div>' +
        '<div class="card" style="margin-top:12px"><h3>Vendas por produto</h3><table><tr><th>Produto</th><th>Pacotes</th><th>Valor</th></tr>' + (r.por_produto.map((p) => '<tr><td>' + esc(p.nome) + '</td><td>' + p.pacotes + '</td><td>' + money(p.total) + '</td></tr>').join('') || '<tr><td colspan="3" class="mut">Sem vendas no período.</td></tr>') + '</table></div>' +
        '<div class="card"><h3>Vendas por dia</h3><table><tr><th>Dia</th><th>Pedidos</th><th>Pacotes</th><th>Total</th></tr>' + (r.por_dia.map((d) => '<tr><td>' + dday(d.dia) + '</td><td>' + d.pedidos + '</td><td>' + d.pacotes + '</td><td><b>' + money(d.total) + '</b></td></tr>').join('') || '<tr><td colspan="4" class="mut">Sem vendas no período.</td></tr>') + '</table></div>' +
        '<div class="card"><h3>Produção por funcionária</h3><table><tr><th>Quem</th><th>Pacotes</th></tr>' + (r.producao.map((p) => '<tr><td>' + esc(p.nome) + '</td><td>' + p.pacotes + '</td></tr>').join('') || '<tr><td colspan="2" class="mut">Sem produção no período.</td></tr>') + '</table></div>' +
        '<div class="card"><h3>Pedidos por situação</h3>' + (Object.keys(r.por_status).map((k) => '<div class="sumline"><span>' + esc(STATUS[k]) + '</span><b>' + r.por_status[k] + '</b></div>').join('') || '<span class="mut">Nenhum pedido.</span>') + '</div>';
    };
    $('rGo').onclick = act(run); run();
  }

  // ---------- eventos globais ----------
  $('view').addEventListener('click', async (e) => {
    const t = e.target;
    const g = t.closest('[data-go]'); if (g) { e.preventDefault(); return go(g.dataset.go); }
    const b = t.closest('[data-a]');
    if (b) return busy(b, async () => { try { await orderAction(b.dataset.a, b.dataset.id); } catch (x) { toast(x.message, 'err'); await refreshOrders(true); go(tab, true); } });
    const aj = t.closest('[data-ajuste]'); if (aj) return ajusteModal(aj.dataset.ajuste, aj.dataset.nome);
    const bq = t.closest('[data-bloq]');
    if (bq) {
      const bloq = bq.dataset.b === '1'; let mot = '';
      if (bloq) { mot = prompt('Motivo do bloqueio do lote:'); if (!mot) return; }
      return busy(bq, async () => { try { await rpc('bloquear_lote', { p_lote: bq.dataset.bloq, p_bloq: bloq, p_motivo: mot }); tEstoque(); } catch (x) { toast(x.message, 'err'); } });
    }
    const pw = t.closest('[data-pw]'); if (pw) return senhaModal(pw.dataset.pw, pw.dataset.nome);
    if (t.closest('[data-pw-self]')) return senhaModal(null);
    const fq = t.closest('[data-fq]'); if (fq) { filaF = fq.dataset.fq; return tPedidos(); }
    const of = t.closest('[data-of]'); if (of) { ordFilter = of.dataset.of; return tTodos(); }
    const x = t.closest('[data-x]'); if (x) return busy(x, async () => { try { await adminOrder(x.dataset.x, x.dataset.id); } catch (y) { toast(y.message, 'err'); } });
    const qp = t.closest('[data-qprice]');
    if (qp) return busy(qp, async () => {
      try { const v = Number(String($('qp-' + qp.dataset.qprice).value).replace(',', '.')); if (!(v > 0)) throw new Error('Digite um preço maior que zero.'); await q(sb.from('produtos').update({ preco_pacote: v }).eq('id', qp.dataset.qprice)); toast('Preço atualizado: ' + money(v), 'ok'); tProdutos(); } catch (y) { toast(y.message, 'err'); }
    });
    const ed = t.closest('[data-edit]'); if (ed) return prodModal(ed.dataset.edit);
    const pp = t.closest('[data-pap]'); if (pp) return busy(pp, async () => { try { await rpc('admin_definir_papel', { p_user: pp.dataset.id, p_role: pp.dataset.pap }); tEquipe(); } catch (y) { toast(y.message, 'err'); } });
    if (t.id === 'rAdd') { readRegs(); regs.push({ nome: '', cidade: '', bairros: '', taxa: '', prazo_extra_min: 0 }); return paintEntrega(); }
    const rd = t.closest('[data-rdel]'); if (rd) { readRegs(); regs.splice(Number(rd.dataset.rdel), 1); return paintEntrega(); }
    if (t.id === 'eSave') return busy(t, async () => { try { await saveEntrega(); } catch (y) { toast(y.message, 'err'); } });
  });
  $('view').addEventListener('change', async (e) => {
    const c = e.target.closest('[data-conf]'); if (!c) return;
    try { await rpc('conferir_item', { p_item: c.dataset.conf, p_val: c.checked }); await refreshOrders(true); go('pedidos', true); } catch (x) { toast(x.message, 'err'); c.checked = !c.checked; }
  });

  (async function boot() {
    if (!AX.configured) { $('view').innerHTML = '<div class="warn">O sistema ainda não foi conectado ao banco de dados (config.js).</div>'; return; }
    const { data } = await sb.auth.getSession();
    if (data.session) afterLogin(); else loginView();
  })();
})();
