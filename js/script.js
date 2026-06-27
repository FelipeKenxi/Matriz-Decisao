function showScreen(name) {
    document.querySelectorAll('.screen').forEach(x => x.style.display = 'none');
    const el = document.getElementById('screen-' + name);
    if (el) el.style.display = 'block';
}



// --- state management ---
const STORAGE_KEY = 'mcd_state_v1';
let state = {
    problem: null,
    criteria: [],
    alternatives: [],
    scores: {},
    current_crit_idx: 0,
    sub_state: null,
    pre_filter_alternatives: null,
    low_var_queue: [],
    dominated_removed: [],
    ordered_criteria: [],
    custom_weights: null,
};

function saveState(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try { state = JSON.parse(raw); } catch(e){ console.warn('invalid state'); }
    }
}

function resetState(){
    state = {
        problem: null,
        criteria: [],
        alternatives: [],
        scores: {},
        current_crit_idx: 0,
        sub_state: null,
        pre_filter_alternatives: null,
        low_var_queue: [],
        dominated_removed: [],
        ordered_criteria: [],
        custom_weights: null,
    };
    saveState();
}

function showFlash(msg){
    alert(msg);
}

// --- helper logic ported from app.py ---
function find_score_logic(scores, valor, target){
    // scores: object name->score
    const menor = Math.min(valor, target);
    const maior = Math.max(valor, target);
    const candidatos = Object.entries(scores).filter(([nome,score]) => score > menor && score < maior);
    if (candidatos.length === 0) return null;
    const meio = (menor + maior) / 2;
    let best = candidatos[0];
    let bestDiff = Math.abs(candidatos[0][1] - meio);
    for (const item of candidatos){
        const d = Math.abs(item[1] - meio);
        if (d < bestDiff){ best = item; bestDiff = d; }
    }
    return best; // [name, score]
}

function normalize_weights(weights){
    const total = Object.values(weights).reduce((a,b)=>a+b,0);
    if (total === 0) return Object.fromEntries(Object.keys(weights).map(k=>[k,0]));
    const out = {};
    for (const k in weights) out[k] = weights[k] / total;
    return out;
}

function rank_sum_weights(ordered_criteria){
    const n = ordered_criteria.length;
    const raw = {};
    ordered_criteria.forEach((crit,i)=> raw[crit] = n - i);
    return normalize_weights(raw);
}

function check_criteria_low_variation(){
    const low = [];
    for (const crit of state.criteria){
        const scores = state.scores[crit] || {};
        const vals = state.alternatives.map(a => (scores[a] !== undefined ? scores[a] : NaN)).filter(x=>!Number.isNaN(x));
        if (vals.length === 0) { low.push(crit); continue; }
        const mx = Math.max(...vals);
        const mn = Math.min(...vals);
        if (Math.abs(mx - mn) <= 1) low.push(crit);
    }
    return low;
}

function remove_dominated_alternatives_logic(){
    const alts = [...state.alternatives];
    const dominated = new Set();
    for (let i=0;i<alts.length;i++){
        const a = alts[i];
        if (dominated.has(a)) continue;
        for (let j=i+1;j<alts.length;j++){
            const b = alts[j];
            if (dominated.has(b)) continue;
            // compare a and b across criteria (higher is better)
            let a_ge = true, b_ge = true, a_strict=false, b_strict=false;
            for (const c of state.criteria){
                const sa = (state.scores[c] && state.scores[c][a]!==undefined) ? state.scores[c][a] : 0;
                const sb = (state.scores[c] && state.scores[c][b]!==undefined) ? state.scores[c][b] : 0;
                if (!(sa >= sb)) a_ge = false;
                if (!(sb >= sa)) b_ge = false;
                if (sa > sb) a_strict = true;
                if (sb > sa) b_strict = true;
            }
            if (a_ge && a_strict) dominated.add(b);
            else if (b_ge && b_strict) { dominated.add(a); break; }
        }
    }
    const kept = alts.filter(a=>!dominated.has(a));
    return {kept, dominated: Array.from(dominated)};
}

// --- UI rendering and handlers ---
function updateHeader(){
    const el = document.getElementById('problem_name');
    el.textContent = state.problem || 'Defina o seu problema de decisão';
}

function renderCriteriaList(){
    const ul = document.getElementById('list-criteria');
    ul.innerHTML = '';
    state.criteria.forEach(c=>{
        const li = document.createElement('li'); li.className='py-2 text-sm text-slate-800 font-medium';
        li.textContent = c; ul.appendChild(li);
    });
}

function renderAlternativesList(){
    const ul = document.getElementById('list-alternatives'); ul.innerHTML = '';
    state.alternatives.forEach(a=>{ const li = document.createElement('li'); li.className='py-2 text-sm text-slate-800 font-medium'; li.textContent = a; ul.appendChild(li); });
}

// --- flow control ---
function goToCriteria(){
    renderCriteriaList();
    showScreen('criteria');
}

function goToAlternatives(){
    renderAlternativesList();
    showScreen('alternatives');
}

function startScoring(){
    state.current_crit_idx = 0;
    // ensure scores structure exists
    for (const c of state.criteria) if (!state.scores[c]) state.scores[c] = {};
    saveState();
    renderScoring();
    showScreen('scoring');
}
function renderScoringMatrixPanel() {

    const panel =
        document.getElementById('scoring-matrix-panel');

    const currentCrit =
        state.criteria[state.current_crit_idx];

    let header = '';

    state.criteria.forEach(c => {

        const cls =
            c === currentCrit
            ? 'bg-amber-50 text-amber-900'
            : '';

        header += `
            <th class="p-2 font-semibold ${cls}">
                ${c}
            </th>
        `;
    });

    let rows = '';

    state.alternatives.forEach(alt => {

        let cells = '';

        state.criteria.forEach(c => {

            let score = null;

            if (state.scores[c] && state.scores[c][alt] !== undefined) 
                score = state.scores[c][alt];
            

            
            else if (
                c === currentCrit &&
                state.sub_state &&
                state.sub_state.temp_scores &&
                state.sub_state.temp_scores[alt] !== undefined
            ) {
                score =
                    state.sub_state.temp_scores[alt];
            }

            cells += `
                <td class="p-2 text-slate-500">
                    ${
                        score !== null
                        ? `<span class="font-bold text-slate-800">${Number(score).toFixed(1)}</span>`
                        : `<span class="text-slate-300">-</span>`
                    }
                </td>
            `;
        });

        rows += `
            <tr class="border-b border-slate-100 hover:bg-slate-50">
                <td class="p-2 font-medium text-slate-700">
                    ${alt}
                </td>
                ${cells}
            </tr>
        `;
    });

    panel.innerHTML = `
        <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 overflow-x-auto">
            <h3 class="text-xs font-bold uppercase text-slate-500 mb-2">
                Painel de Acompanhamento da Matriz
            </h3>

            <table class="w-full text-left text-sm border-collapse">
                <thead>
                    <tr class="bg-slate-100 border-b border-slate-200">
                        <th class="p-2 font-semibold">
                            Alternativas
                        </th>
                        ${header}
                    </tr>
                </thead>

                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}



function renderScoring(){
    renderScoringMatrixPanel();

    const crit_idx = state.current_crit_idx;
    const criteria = state.criteria;
    if (crit_idx >= criteria.length){
        // done
        filter_pipeline_init();
        return;
    }
    const current_crit = criteria[crit_idx];
    const sc = document.getElementById('scoring-container');
    const sub = state.sub_state || {};

    

    if (!state.sub_state || !state.sub_state.best_alt){
        // show anchor selection
        sc.innerHTML = `
        <div class="mb-6 bg-slate-800 text-white p-4 rounded-xl flex justify-between items-center shadow-sm">
            <div>
                <span class="text-xs font-bold uppercase tracking-widest text-slate-400">Avaliando Critério</span>
                <h2 class="text-xl font-bold"> ${current_crit} (${crit_idx+1} de ${criteria.length})</h2>
                <button type="button" id="btn-return-scoring" onclick="ReturnScoring()"></button>
            </div>
        </div>
        <div class="bg-white p-6 rounded-xl shadow-md border border-slate-200">
            <h3 class="font-bold text-lg mb-3">Definição de ancoras de ${current_crit} </h3>
            <p class="text-sm text-slate-600 mb-4">Escolha as alternativas que representam os limites máximo e mínimo do critério.</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label for= "best_alt_sel" class="block text-sm font-semibold text-slate-700 mb-1">Melhor Alternativa:</label>
                    <select id="best_alt_sel" class="w-full p-2 border rounded-lg bg-white">
                    </select>
                </div>
                <div>
                    <label for="worst_alt_sel" class="block text-sm font-semibold text-slate-700 mb-1">Pior Alternativa:</label>
                    <select id="worst_alt_sel" class="w-full p-2 border rounded-lg bg-white">
                    </select>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                    <label for="best_score_inp" class="block text-sm font-semibold text-slate-700 mb-1">Score Máximo (Sugerido 10):</label>
                    <input id="best_score_inp" type="number" step="any" value="10" class="w-full p-2 border rounded-lg">
                </div>
                <div>
                    <label for="worst_score_inp" class="block text-sm font-semibold text-slate-700 mb-1">Score Mínimo (Sugerido 0):</label>
                    <input id="worst_score_inp" type="number" step="any" value="0" class="w-full p-2 border rounded-lg">
                </div>
            </div>
            <div class="pt-4 text-right">
                <button id="btn-set-anchors" class="bg-slate-900 text-white px-6 py-2 rounded-lg font-medium">Definir Âncoras</button>
            </div>
        </div>
        `;

        const return_btn = document.getElementById('btn-return-scoring');
        if (crit_idx <= 0){
            return_btn.innerHTML = 'Voltar'
        }
        else
            return_btn.innerHTML = 'Voltar Criterio anterior'



        // populate selects
        const bestSel = document.getElementById('best_alt_sel');
        const worstSel = document.getElementById('worst_alt_sel');
        bestSel.innerHTML = worstSel.innerHTML = '';
        state.alternatives.forEach(a=>{ const opt = document.createElement('option'); opt.value=a; opt.textContent=a; bestSel.appendChild(opt); worstSel.appendChild(opt.cloneNode(true)); });
        document.getElementById('btn-set-anchors').onclick = ()=>{
            const best_alt = document.getElementById('best_alt_sel').value;
            const worst_alt = document.getElementById('worst_alt_sel').value;
            const bscore = parseFloat(document.getElementById('best_score_inp').value);
            const wscore = parseFloat(document.getElementById('worst_score_inp').value);
            if (!best_alt || !worst_alt || best_alt === worst_alt){ showFlash('A melhor e a pior alternativa precisam ser diferentes.'); return; }
            const temp_scores = {};
            temp_scores[best_alt] = bscore; temp_scores[worst_alt] = wscore;
            const remaining = state.alternatives.filter(a=>a!==best_alt && a!==worst_alt);
            if (remaining.length === 0) {

                state.scores[current_crit] = temp_scores;

                state.current_crit_idx++;
                state.sub_state = null;

                saveState();
                renderScoring();

                return;
            }

            state.sub_state = {
                best_alt,
                worst_alt,
                best_score: bscore,
                worst_score: wscore,
                temp_scores,
                remaining_alts: remaining,
                stage: 'ask_closer'
            };

            saveState();
            renderScoring();
                };
                return;
            }

    // sub flow
    const current_alt = state.sub_state.remaining_alts[0];
    if (state.sub_state.stage === 'ask_closer'){
        sc.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-md border border-slate-200">
            <div class="flex justify-between items-start mb-4 border-b pb-2">
                <div>
                    <h2 class="text-xl font-bold text-slate-900 mt-1">Onde a alternativa '<span class="text-amber-600 font-extrabold">${current_alt}</span>' se localiza melhor?</h2>
                </div>
            </div>
            <div class="bg-slate-50 border p-4 rounded-lg mb-6 text-sm">
                <p class="font-medium text-slate-700">Janela de comparação de limites ativa:</p>
                <ul class="list-disc pl-5 mt-1 text-slate-600">
                    <li>Âncora Superior Atual: <strong>${state.sub_state.best_alt}</strong> (Score: ${state.sub_state.best_score})</li>
                    <li>Âncora Inferior Atual: <strong>${state.sub_state.worst_alt}</strong> (Score: ${state.sub_state.worst_score})</li>
                </ul>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button id="btn-closer-best" class="p-4 border-2 border-slate-200 rounded-xl font-semibold text-slate-800 bg-white">Mais próxima de '${state.sub_state.best_alt}' (${state.sub_state.best_score})</button>
                <button id="btn-closer-worst" class="p-4 border-2 border-slate-200 rounded-xl font-semibold text-slate-800 bg-white">Mais próxima de '${state.sub_state.worst_alt}' (${state.sub_state.worst_score})</button>
            </div>
        </div>
        `;
        document.getElementById('btn-closer-best').onclick = ()=> scoring_closer_submit('best');
        document.getElementById('btn-closer-worst').onclick = ()=> scoring_closer_submit('worst');
        return;
    }

    if (state.sub_state.stage === 'ask_score'){
        const min_b = Math.min(state.sub_state.best_score, state.sub_state.worst_score);
        const max_b = Math.max(state.sub_state.best_score, state.sub_state.worst_score);
        sc.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-md border border-slate-200">
            <h2 class="text-xl font-bold text-slate-900">Defina o Score Final de '<span class="text-amber-600 font-extrabold">${current_alt}</span>'</h2>
            <p class="text-sm text-slate-600 mb-4">O Score deve estar obrigatoriamente entre <strong>${min_b}</strong> e <strong>${max_b}</strong>.</p>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1">Score para '${current_alt}':</label>
                <input id="score_input" type="number" step="any" value="${state.sub_state.sugerido || ((min_b+max_b)/2)}" min="${min_b}" max="${max_b}" class="w-full p-2 border rounded-lg">
            </div>
            <div class="pt-2 text-right">
                <button id="btn-confirm-score" class="bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium">Confirmar Valor</button>
            </div>
        </div>
        `;
        document.getElementById('btn-confirm-score').onclick = ()=>{
            const val = parseFloat(document.getElementById('score_input').value);
            if (isNaN(val)){ showFlash('Digite um score numérico válido.'); return; }
            scoring_value_submit(val);
        };
        return;
    }

}

function scoring_closer_submit(closer_choice){
    const sub = state.sub_state;
    const best_alt = sub.best_alt; const worst_alt = sub.worst_alt;
    let best_score = sub.best_score; let worst_score = sub.worst_score;
    if (closer_choice === 'best'){
        const direction = -1; const direction_score = best_score; const gap = (best_score - worst_score)/2; worst_score = direction_score + (gap * direction);
    } else {
        const direction = 1; const direction_score = worst_score; const gap = (best_score - worst_score)/2; best_score = direction_score + (gap * direction);
    }
    const mid = find_score_logic(sub.temp_scores, (best_score+worst_score)/2, (best_score+worst_score)/2);
    // choose next stage similar to server: if mid exists and gap >=1 then replace anchor
    const gapFinal = Math.abs(best_score - worst_score) / 2;
    if (mid !== null && gapFinal >= 1){
        const [nome, score] = mid;
        // when chooser was best, we updated worst anchor to mid; else update best anchor
        if (Math.abs(sub.best_score - best_score) < Math.abs(sub.worst_score - worst_score)){
            // best changed little - assume worst replaced
            sub.worst_alt = nome; sub.worst_score = score; sub.stage = 'ask_closer';
        } else {
            sub.best_alt = nome; sub.best_score = score; sub.stage = 'ask_closer';
        }
    } else {
        const sugerido = ( (best_score + worst_score) / 2 );
        sub.sugerido = sugerido; sub.best_score = best_score; sub.worst_score = worst_score; sub.stage = 'ask_score';
    }
    state.sub_state = sub; saveState(); renderScoring();
}

function scoring_value_submit(value){
    const sub = state.sub_state; const current_alt = sub.remaining_alts[0];
    const min_b = Math.min(sub.best_score, sub.worst_score); const max_b = Math.max(sub.best_score, sub.worst_score);
    if (!(min_b <= value && value <= max_b)){ showFlash(`O score deve estar contido obrigatoriamente no intervalo [${min_b}, ${max_b}].`); return; }
    sub.temp_scores[current_alt] = value; sub.remaining_alts.shift();
    if (sub.remaining_alts.length){
        const alts_salvas = Object.keys(sub.temp_scores);
        sub.best_alt = alts_salvas[0]; sub.worst_alt = alts_salvas[1]; sub.best_score = sub.temp_scores[alts_salvas[0]]; sub.worst_score = sub.temp_scores[alts_salvas[1]]; sub.stage = 'ask_closer';
    } else {
        // finish this criterion
        const crit = state.criteria[state.current_crit_idx];
        state.scores[crit] = sub.temp_scores;
        state.current_crit_idx += 1; state.sub_state = null; saveState();
    }
    renderScoring();
}

// --- filter pipeline ---
function filter_pipeline_init(){
    state.pre_filter_alternatives = [...state.alternatives];
    state.low_var_queue = check_criteria_low_variation();
    saveState();
    if (state.low_var_queue.length) ask_variation_removal(); else execute_dominance_check();
}

function ask_variation_removal(){
    if (!state.low_var_queue.length){ execute_dominance_check(); return; }
    const current_crit = state.low_var_queue[0];
    const cont = document.getElementById('variation-container');
    let rows = '';
    for (const alt of state.alternatives){ const s = (state.scores[current_crit] && state.scores[current_crit][alt]!==undefined) ? state.scores[current_crit][alt].toFixed(1) : '-'; rows += `<tr class="hover:bg-slate-50"><td class="p-3 font-semibold text-slate-800">${alt}</td><td class="p-3 font-mono font-bold text-slate-700">${s}</td></tr>`; }
    cont.innerHTML = `
    <div class="bg-white p-6 rounded-xl shadow-md border border-slate-200">
        <h2 class="text-xl font-bold text-amber-600">Critério Sem Variação Detectado</h2>
        <p class="text-sm text-slate-700 mb-4">O critério '<strong>${current_crit}</strong>' apresentou scores com variação irrelevante entre as alternativas (diferença ≤ 1).</p>
        <p class="text-sm font-medium text-slate-950 mb-6">Confirma a remoção desse critério da matriz?</p>
        <div class="flex gap-4"><button id="var-remove-yes" class="bg-rose-600 text-white px-6 py-2 rounded-lg">Sim, Remover Critério</button><button id="var-remove-no" class="bg-slate-200 text-slate-700 px-6 py-2 rounded-lg">Não, Manter Critério</button></div>
    </div>
    <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 overflow-x-auto mt-4">
        <h3 class="text-xs font-bold uppercase text-slate-500 mb-2">Scores Atuais para o Critério: ${current_crit}</h3>
        <table class="w-full text-left text-sm border-collapse bg-white rounded-lg overflow-hidden shadow-sm border border-slate-100"><thead><tr class="bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase"><th class="p-3">Alternativa</th><th class="p-3 bg-amber-50/50 text-amber-900">Score Bruto</th></tr></thead><tbody class="divide-y divide-slate-100">${rows}</tbody></table></div>
    `;
    showScreen('filter-variation');
    document.getElementById('var-remove-yes').onclick = ()=>{ confirm_variation_removal(true, current_crit); };
    document.getElementById('var-remove-no').onclick = ()=>{ confirm_variation_removal(false, current_crit); };
}

function confirm_variation_removal(remove, crit){
    if (remove){
        const idx = state.criteria.indexOf(crit); if (idx>=0) state.criteria.splice(idx,1);
        delete state.scores[crit];
    }
    state.low_var_queue.shift(); saveState(); ask_variation_removal();
}

function execute_dominance_check(){
    if (!state.criteria.length){ showFlash('Erro crítico: Todos os critérios foram removidos por falta de variação.'); resetState(); showScreen('problem'); updateHeader(); return; }
    const out = remove_dominated_alternatives_logic();
    state.alternatives = out.kept; state.dominated_removed = out.dominated; state.ordered_criteria = [...state.criteria]; saveState();
    if (out.dominated.length) show_dominance_view(); else ranking_criteria_view();
}

function show_dominance_view(){
    const cont = document.getElementById('dominance-container');
    let list = '';
    for (const d of state.dominated_removed) list += `<li>${d}</li>`;
    cont.innerHTML = `
    <div class="bg-white p-6 rounded-xl shadow-md border border-slate-200">
        <h2 class="text-xl font-bold text-slate-900">Análise de Dominância de Alternativas</h2>
        <div class="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-6"><h3 class="text-sm font-bold text-amber-800 mb-2">Alternativas Removidas (Dominadas):</h3><ul class="list-disc pl-5 space-y-1 text-sm text-amber-900 font-medium">${list}</ul></div>
        <div class="pt-4 border-t border-slate-100 flex justify-end"><button id="dom-understood" class="bg-slate-900 text-white font-bold px-6 py-2 rounded-lg">Entendido, Continuar</button></div>
    </div>
    `;
    showScreen('show-dominance');
    document.getElementById('dom-understood').onclick = ()=> ranking_criteria_view();
}

function ranking_criteria_view(){
    const cont = document.getElementById('ranking-container');
    function render(){
        let rows = '';
        state.ordered_criteria.forEach((c,i)=>{
            rows += `<div class="flex items-center justify-between py-3 px-2 bg-white rounded shadow-sm my-1"><span class="font-medium text-slate-800 text-sm">📍 ${i+1}. ${c}</span><div class="flex gap-1"><button data-up="${c}" class="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded border">🔼 Subir</button><button data-down="${c}" class="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded border">🔽 Descer</button></div></div>`;
        });
        cont.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-md border border-slate-200">
            <h2 class="text-xl font-bold text-slate-900">Etapa 4: Ranking dos critérios para o rank-sum</h2>
            <p class="text-sm text-slate-600 mb-4">Ordene a lista deixando os critérios mais importantes no topo.</p>
            <div class="border rounded-lg p-2 bg-slate-50 divide-y">${rows}</div>
            <div class="pt-4 text-center"><button id="finalize-ranking" class="bg-emerald-600 text-white font-bold px-8 py-3 rounded-lg">Calcular Matriz Ponderada & Ranking</button></div>
        </div>
        `;
        showScreen('ranking-criteria');
        // attach handlers
        cont.querySelectorAll('[data-up]').forEach(btn=> btn.onclick = ()=>{ const c = btn.getAttribute('data-up'); const idx = state.ordered_criteria.indexOf(c); if (idx>0){ state.ordered_criteria.splice(idx,1); state.ordered_criteria.splice(idx-1,0,c); saveState(); render(); } });
        cont.querySelectorAll('[data-down]').forEach(btn=> btn.onclick = ()=>{ const c = btn.getAttribute('data-down'); const idx = state.ordered_criteria.indexOf(c); if (idx < state.ordered_criteria.length-1){ state.ordered_criteria.splice(idx,1); state.ordered_criteria.splice(idx+1,0,c); saveState(); render(); } });
        document.getElementById('finalize-ranking').onclick = ()=> results_dashboard();
    }
    render();
}

function results_dashboard(){
    // prepare weights
    if (!state.custom_weights) state.custom_weights = rank_sum_weights(state.ordered_criteria);
    const weights = {...state.custom_weights};
    // compute weighted totals
    const mat_raw = {};
    state.alternatives.forEach(a=>{ mat_raw[a] = {}; state.criteria.forEach(c=> mat_raw[a][c] = (state.scores[c] && state.scores[c][a]!==undefined) ? state.scores[c][a] : 0); });
    const mat_weighted = {};
    state.alternatives.forEach(a=>{ let total=0; mat_weighted[a] = {}; state.criteria.forEach(c=>{ const w = weights[c] || 0; const val = mat_raw[a][c]; const v = val * w; mat_weighted[a][c] = v; total += v; }); mat_weighted[a]['TOTAL']=total; });
    const ranking_list = Object.entries(mat_weighted).map(([alt,row])=> [alt, row['TOTAL']]).sort((a,b)=>b[1]-a[1]);

    // render
    const cont = document.getElementById('results-container');
    // weights sliders
    let weightCards = '';
    state.ordered_criteria.forEach((crit,idx)=>{ const p = (weights[crit]||0)*100; weightCards += `<div class="bg-slate-50 border p-3 rounded-lg flex flex-col"><div class="flex justify-between mb-2"><label class="text-xs font-semibold text-slate-600 uppercase tracking-wider">${crit}</label><span id="val_${idx}" class="text-xs font-bold">${p.toFixed(1)}%</span></div><input type="range" data-crit="${crit}" min="0" max="100" step="0.1" value="${p.toFixed(1)}" class="w-full cursor-pointer" oninput="document.getElementById('val_${idx}').innerText = parseFloat(this.value).toFixed(1) + '%'"> </div>`; });

    let rankingHtml = '';
    ranking_list.forEach((r,i)=>{ rankingHtml += `<div class="flex items-center justify-between p-3 rounded-lg ${i===0? 'bg-amber-500/20 border border-amber-500/50' : 'bg-white/5 border border-white/10'}"><div class="flex items-center gap-3"><span class="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${i===0? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-slate-300'}">${i+1}</span><span class="font-semibold text-sm md:text-base">${r[0]}</span></div><div class="text-right"><span class="font-mono font-bold text-lg text-emerald-400">${r[1].toFixed(3)}</span></div></div>`; });

    let tableRows = '';
    state.alternatives.forEach(a=>{
        let cells = '';
        state.criteria.forEach(c=> cells += `<td class="p-3 font-mono text-slate-600">${mat_weighted[a][c].toFixed(3)} <span class="text-[10px] text-slate-300 block">(bruto: ${mat_raw[a][c].toFixed(1)})</span></td>`);
        tableRows += `<tr class="hover:bg-slate-50"><td class="p-3 font-semibold text-slate-800">${a}</td>${cells}<td class="p-3 font-mono font-bold text-emerald-600 bg-emerald-50/50">${mat_weighted[a]['TOTAL'].toFixed(3)}</td></tr>`;
    });

    cont.innerHTML = `
    <div class="space-y-6">
        <div class="bg-white p-6 rounded-xl shadow-md border border-slate-200">
            <h2 class="text-xl font-bold text-slate-900">Pesos Finais dos Critérios</h2>
            <form id="weights-form"><div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">${weightCards}</div><div class="mt-4 text-center"><span id="total_weight" class="font-bold text-slate-700">Soma: 100%</span></div><div class="mt-4 text-right pt-4 border-t border-slate-100"><button id="update-weights" class="bg-slate-800 text-white px-6 py-2 rounded-lg text-sm font-bold">Atualizar Pesos e Recalcular</button></div></form>
        </div>
        <div class="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 rounded-xl shadow-lg">${rankingHtml}</div>
        <div class="bg-white p-6 rounded-xl shadow-md border border-slate-200 overflow-x-auto"><h2 class="text-lg font-bold text-slate-900 mb-3">🔍 Detalhamento dos Scores Ponderados</h2><table class="w-full text-left text-sm border-collapse"><thead><tr class="bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase"><th class="p-3">Alternativa</th>${state.criteria.map(c=>`<th class="p-3">${c}</th>`).join('')}<th class="p-3 bg-emerald-50 text-emerald-900">Total</th></tr></thead><tbody class="divide-y divide-slate-100">${tableRows}</tbody></table></div>
        <div class="text-center pt-2"><button id="btn-restart" class="bg-rose-600 text-white px-6 py-2 rounded-lg text-sm font-semibold">Nova Tomada de Decisão (Zerar Tudo)</button></div>
    </div>
    `;

    showScreen('results');

    // attach handlers
    document.querySelectorAll('input[type="range"]').forEach(slider=> slider.addEventListener('input', updateTotalLabel));
    updateTotalLabel();
    document.getElementById('update-weights').onclick = (e)=>{ e.preventDefault(); const raw = {}; document.querySelectorAll('input[type="range"]').forEach(s=> raw[s.getAttribute('data-crit')] = parseFloat(s.value)); const total = Object.values(raw).reduce((a,b)=>a+b,0); if (Math.abs(total - 100) > 0.01){ showFlash(`A soma dos pesos deve ser 100%. Valor atual: ${total.toFixed(1)}%`); return; } state.custom_weights = {}; for (const k in raw) state.custom_weights[k] = raw[k]/100; saveState(); results_dashboard(); };
    document.getElementById('btn-restart').onclick = ()=>{ resetState(); updateHeader(); showScreen('problem'); };
}

function updateTotalLabel(){
    let total = 0; document.querySelectorAll('input[type="range"]').forEach(sl=> total += parseFloat(sl.value)); const label = document.getElementById('total_weight'); label.innerText = `Soma: ${total.toFixed(1)}%`; label.className = Math.abs(total - 100) < 0.01 ? 'font-bold text-emerald-600' : 'font-bold text-red-600';
}

// --- init and bindings ---
function init(){
    resetState(); updateHeader();
    // problem form
    const formProblem = document.getElementById('form-problem');
    formProblem.onsubmit = (e)=>{ e.preventDefault(); const val = document.getElementById('input-problem').value.trim(); if (!val){ showFlash('A descrição do problema não pode estar vazia.'); return; } state.problem = val; saveState(); updateHeader(); goToCriteria(); };

    // criteria bindings
    document.getElementById('btn-add-criterion').onclick = ()=>{ const v = document.getElementById('input-criterion').value.trim(); if (!v) { showFlash('O campo do critério não pode estar vazio.'); return; } if (state.criteria.includes(v)){ showFlash('Este critério já foi inserido.'); return; } state.criteria.push(v); state.ordered_criteria = [...state.criteria]; document.getElementById('input-criterion').value=''; saveState(); renderCriteriaList(); };
    document.getElementById('btn-remove-criterion').onclick = ()=>{ state.criteria.pop(); state.ordered_criteria = [...state.criteria]; saveState(); renderCriteriaList(); };
    document.getElementById('btn-submit-criteria').onclick = ()=>{ if (state.criteria.length < 2){ showFlash('Insira pelo menos 2 critérios.'); return; } goToAlternatives(); };

    // alternatives
    document.getElementById('btn-add-alternative').onclick = ()=>{ const v = document.getElementById('input-alternative').value.trim(); if (!v) { showFlash('O nome da alternativa não pode estar vazio.'); return; } if (state.alternatives.includes(v)){ showFlash('Esta alternativa já foi inserida.'); return; } state.alternatives.push(v); document.getElementById('input-alternative').value=''; saveState(); renderAlternativesList(); };
    document.getElementById('btn-remove-alternative').onclick = ()=>{ state.alternatives.pop(); saveState(); renderAlternativesList(); };
    document.getElementById('btn-submit-alternatives').onclick = ()=>{ if (state.alternatives.length < 2){ showFlash('Insira pelo menos 2 alternativas.'); return; } startScoring(); };

    //return
    document.querySelectorAll('.btn-return').forEach(btn => {btn.onclick = () => {
        saveState();
        if (btn.value == 'criteria')
            goToCriteria();
        else if (btn.value == 'alternatives')
            goToAlternatives();
        else if (btn.value == 'scoring'){
            startScoring();
        }
        else
            showScreen(btn.value);
    }});


    



    // initial screen
    if (!state.problem) { showScreen('problem'); } else if (!state.criteria.length) { showScreen('criteria'); renderCriteriaList(); updateHeader(); } else if (!state.alternatives.length) { showScreen('alternatives'); renderAlternativesList(); updateHeader(); } else { renderScoring(); }
}

function ReturnScoring(){
        btn = document.getElementById('btn-return-scoring');
        if (state.current_crit_idx <= 0){
            goToAlternatives();
        }
        else
        {
            const crit = state.criteria[state.current_crit_idx];
            state.scores[crit] = null;
            state.current_crit_idx -= 1; state.sub_state = null; saveState();
            renderScoring();
        }
    
}

document.addEventListener('DOMContentLoaded', init);