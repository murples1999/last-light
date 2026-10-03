// Versioned, deterministic rules shared by the Worker and offline/browser clients.
// Views are data, never HTML. They hide other roles' clues in normal play; public
// source and the seed are intentionally not a confidentiality/security boundary.
const Campaign = (() => {
  const VERSION = 1, TOTAL = 10, SEEDS = 72;
  const names = ['Engineering', 'Communications', 'Navigation'];
  const feeds = ['A', 'B', 'C', 'D'], terminals = ['K7', 'M4', 'R2'];
  const targets = { K7: 2, M4: 3, R2: 1 };
  const permutations = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  const fragments = ['EMBER', 'TIDE', 'HALO', 'WREN'];
  const cargo = ['Sensor', 'Water', 'Battery', 'Tools', 'Food', 'Shield'];
  const weights = [1, 1, 2, 2, 3, 3];
  const operations = ['cool', 'vent', 'release', 'prime', 'align', 'launch'];
  const opLabels = { cool:'Start coolant', vent:'Vent chamber', release:'Release latch', prime:'Prime engine', align:'Align beacon', launch:'Arm launch' };
  const titles = ['First Light', 'Relay Autopsy', 'Spare Circuit', 'Broken Transmission', 'Harmonic Lock', 'Debris Corridor', 'Cargo Trim', 'Cold Start', 'Relay Run', 'Last Light'];
  const goals = [
    'Read the other stations and allocate a shared six-unit reserve.',
    'Compare a relay at low and high load before diagnosing a fault.',
    'Replace an isolated feed with a healthy spare without exceeding the reserve.',
    'Combine partial ordering clues into one coherent transmission.',
    'Use relationships between three instruments to tune a signal.',
    'Plan a safe route through ordered waypoints and budget its fuel.',
    'Balance unequal cargo while respecting placement constraints.',
    'Coordinate role-owned actions in a safe dependency order.',
    'Make routing, power and signal phase agree on the same network path.',
    'Combine repair, signal tuning and a coordinated launch procedure.'
  ];
  const briefings = [
    'The emergency panel is healthy, but all three buses are dark. Every unit has a destination.',
    'A relay passes a weak signal but drops out under load. Run an experiment before replacing it.',
    'Now the fault is in a working circuit. Restore oxygen, radio and the escape beacon together.',
    'Four radio fragments arrived out of order. The stations recovered different parts of the timing log.',
    'The antenna is awake, but its oscillator, amplifier and phase wheel disagree.',
    'Debris blocks the escape lane. Plot a reversible route through both survey beacons.',
    'The pod cannot steer with an uneven load. Stow every crate and respect its handling notes.',
    'The pod systems must wake in sequence. Each station can perform two of the six operations.',
    'A packet must cross the service relay and reach HOME with enough power and the correct phase.',
    'The final reserve is damaged. Repair it, establish a clean signal, then arm a safe launch.'
  ];
  const clone = value => JSON.parse(JSON.stringify(value));
  const opt = (value, label = String(value)) => ({ value:String(value), label });
  const nums = (min,max) => Array.from({length:max-min+1},(_,i)=>opt(min+i));
  const select = (field,label,value,options) => ({field,label,type:'select',value:String(value),options});
  const button = (field,label,value=field) => ({field,label,type:'button',value:String(value)});
  const reading = (label,value) => ({label,value:String(value)});
  const sum = xs => xs.reduce((a,b)=>a+b,0);
  const eq = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  function seededPower(seed) {
    const spare=seed%4, fixed=[0,1,2,3].filter(i=>i!==spare), perm=permutations[Math.floor(seed/4)%6], routes=[null,null,null,null];
    fixed.forEach((i,j)=>routes[i]=terminals[perm[j]]);
    return {spare,fault:fixed[Math.floor(seed/24)%3],routes,alloc:[0,0,0,0],trace:0,isolate:-1,patch:'NONE'};
  }
  const output = (p,i) => p.isolate===i || p.fault===i&&p.alloc[i]>1 ? 0 : p.alloc[i];
  function totals(p) { const t={K7:0,M4:0,R2:0}; for(let i=0;i<4;i++){const k=i===p.spare?p.patch:p.routes[i];if(terminals.includes(k))t[k]+=output(p,i);}return t; }
  function tune(seed) { return {frequency:2+seed%5,gain:1+Math.floor(seed/5)%4,phase:seed%4}; }
  function order(seed) { const start=seed%4, reverse=Math.floor(seed/4)%2; return Array.from({length:4},(_,i)=>fragments[(start+(reverse?4-i:i))%4]); }
  function transformCell(cell,seed) { let x=cell%4,y=Math.floor(cell/4);for(let n=0;n<seed%4;n++)[x,y]=[3-y,x];return y*4+x; }
  function routeMap(seed) {
    // Every rotated layout has a known simple route of six moves. Additional
    // clear tiles allow experimentation; fuel and ordered beacons constrain it.
    const path=[0,1,5,6,10,11,15].map(i=>transformCell(i,seed));
    const blocked=[2,3,7,8,12,13].map(i=>transformCell(i,seed));
    return {start:path[0],end:path.at(-1),beacons:[path[2],path[4]],blocked};
  }
  function makePuzzle(level,seed) {
    switch(level) {
      case 0:return {kind:'allocation',routes:permutations[seed%6].map(i=>terminals[i]),values:{feed0:'0',feed1:'0',feed2:'0'}};
      case 1:return {kind:'diagnosis',fault:seed%4,routes:[...terminals,'SPARE'],values:{load:'0',trace:'0',isolate:'-1',report:'K7'},observations:[[],[],[],[]]};
      case 2:return {kind:'repair',power:seededPower(seed)};
      case 3:return {kind:'ordering',answer:order(seed),values:{slot0:'EMBER',slot1:'EMBER',slot2:'EMBER',slot3:'EMBER'}};
      case 4:return {kind:'tuning',target:tune(seed),values:{frequency:'1',gain:'0',phase:'0'}};
      case 5:return {kind:'route',map:routeMap(seed),route:[routeMap(seed).start],values:{fuel:'0',beaconOrder:'BLUE-AMBER'}};
      case 6:return {kind:'cargo',restrictedBay:seed%3,values:Object.fromEntries(cargo.map((_,i)=>['crate'+i,'0']))};
      case 7:return {kind:'sequence',sequence:[],values:{}};
      case 8:return {kind:'network',offset:seed%3,values:{branch:'0',exit:'0',power:'0',phase:'0'}};
      case 9:return {kind:'finale',phase:0,power:seededPower((seed+17)%SEEDS),target:tune((seed+11)%SEEDS),values:{frequency:'1',gain:'0',phase:'0'},sequence:[]};
      default:throw Error('Unknown campaign level');
    }
  }
  function create(seed) {
    if(seed===undefined)seed=crypto.getRandomValues(new Uint32Array(1))[0]%SEEDS;
    if(!Number.isInteger(seed)||seed<0||seed>=SEEDS)throw Error('Campaign seed must be an integer from 0 to 71');
    return {version:VERSION,seed,level:0,total:TOTAL,status:'playing',completed:[],checkpoint:null,puzzle:makePuzzle(0,seed),checks:0};
  }
  function baseView(c,r) {
    const level=Math.min(c.level,TOTAL-1);
    return {id:'last-light-'+(level+1),number:level+1,total:TOTAL,title:titles[level],briefing:briefings[level],learningGoal:goals[level],objective:'',submitInstruction:'Engineering runs the system check once all stations agree.',status:c.status,clues:[],readings:[],controls:[],check:r===0?{label:'Run system check',role:0}:null,next:null,progress:{step:0,total:1,label:'System not yet verified'}};
  }
  function powerView(v,p,r) {
    v.objective='Isolate the faulty feed and deliver exactly K7 2, M4 3 and R2 1 using six units.';
    if(r===0){v.clues=['Six units are shared across four feeds. Allocations on isolated or unpatched lines still consume the reserve. Ask Communications which line drops out; ask Navigation where the spare is needed.'];v.controls=feeds.map((l,i)=>select('feed'+i,'Feed '+l,p.alloc[i],nums(0,3)));v.readings=[reading('Reserve allocated',sum(p.alloc)+' / 6'),reading('Isolated feed',p.isolate<0?'None':feeds[p.isolate])];}
    if(r===1){const i=p.trace,k=i===p.spare?p.patch:p.routes[i];v.clues=['One fixed relay works at one unit and drops out at two or three. Trace powered lines. The spare is healthy.'];v.controls=[select('trace','Trace relay',i,feeds.map((f,i)=>opt(i,f))),select('isolate','Isolate relay',p.isolate,[opt(-1,'None'),...feeds.map((f,i)=>opt(i,f))])];v.readings=[reading('Relay',feeds[i]+' → '+(k||'Unpatched')),reading('Relay type',i===p.spare?'Spare':'Fixed'),reading('Input / output',p.alloc[i]+' / '+output(p,i)),reading('Trace',p.isolate===i?'ISOLATED':p.alloc[i]===0?'NO SIGNAL':k==='NONE'?'NO DESTINATION':output(p,i)===0?'DROPOUT':'PASSING')];}
    if(r===2){const t=totals(p);v.clues=['K7 oxygen needs 2 units. M4 radio needs 3. R2 beacon needs 1. Redirect the healthy spare to the failed fixed relay’s destination.'];v.controls=[select('patch','Spare destination',p.patch,[opt('NONE','Unpatched'),...terminals.map(k=>opt(k))])];v.readings=terminals.map(k=>reading(k+' target '+targets[k],t[k]===targets[k]?'STABLE':t[k]<targets[k]?'LOW':'HIGH'));}
  }
  function tuneView(v,p,r) {
    const t=p.target,a=p.values;
    v.objective='Tune the carrier, gain and phase until all three instruments agree.';
    if(r===0){v.clues=['The amplifier energy must equal '+(t.frequency+t.gain)+'. Energy = carrier frequency + amplifier gain.'];v.controls=[select('gain','Amplifier gain',a.gain,nums(0,4))];v.readings=[reading('Energy',Number(a.frequency)+Number(a.gain))];}
    if(r===1){v.clues=['The clean carrier is '+t.frequency+'. Tell Engineering; Navigation has the phase reference.'];v.controls=[select('frequency','Carrier frequency',a.frequency,nums(1,8))];v.readings=[reading('Carrier',Number(a.frequency)===t.frequency?'CLEAN':'NOISY')];}
    if(r===2){v.clues=['Phase reference: (carrier + phase) modulo 4 must equal '+((t.frequency+t.phase)%4)+'.'];v.controls=[select('phase','Phase wheel',a.phase,nums(0,3))];v.readings=[reading('Phase reference',(Number(a.frequency)+Number(a.phase))%4)];}
  }
  function sequenceView(v,p,r) {
    v.objective='Complete the six-step startup procedure in the safe dependency order.';
    const own=operations.filter((_,i)=>i%3===r);
    const clues=[['Coolant is the first operation. Prime only after Navigation releases the latch.'],['Vent immediately after coolant starts. Align only after the engine is primed.'],['Release the latch immediately after venting. Arm launch only after Communications aligns the beacon.']];
    v.clues=clues[r];v.controls=own.map(op=>button(op,opLabels[op]));v.readings=[reading('Completed operations',p.sequence.map(op=>opLabels[op]).join(' → ')||'None')];v.progress={step:p.sequence.length,total:6,label:'Startup operations'};
  }
  function view(c,r) {
    if(!Number.isInteger(r)||r<0||r>2)return null;
    if(c.views)return c.views[r]?clone(c.views[r]):null;
    const v=baseView(c,r),p=c.puzzle,a=p.values;
    switch(Math.min(c.level,9)) {
      case 0:
        v.objective='Power all three healthy systems using exactly six units.';
        v.submitInstruction='Engineering sets each feed, then runs the system check. Ask both other stations for their readings first.';
        if(r===0){v.clues=['All relays are healthy. Set one feed at a time. Communications has the wiring map; Navigation knows each target.'];v.controls=[0,1,2].map(i=>select('feed'+i,'Feed '+feeds[i],a['feed'+i],nums(0,3)));v.readings=[reading('Reserve allocated',sum(Object.values(a).map(Number))+' / 6')];}
        if(r===1)v.clues=p.routes.map((k,i)=>'Feed '+feeds[i]+' powers '+k+'.');
        if(r===2){v.clues=['K7 oxygen requires 2 units. M4 radio requires 3. R2 beacon requires 1.'];v.readings=p.routes.map((k,i)=>reading(k,Number(a['feed'+i])===targets[k]?'STABLE':'NEEDS ADJUSTMENT'));}break;
      case 1:
        v.objective='Observe the suspect relay at both 1 and 2 units, isolate it, and report its destination.';
        if(r===0){v.clues=['Set the diagnostic load to 1, then to 2 when Communications is ready. This test supply is separate from the ship reserve.'];v.controls=[select('load','Diagnostic load',a.load,nums(0,2))];v.readings=[reading('Load',a.load)];}
        if(r===1){v.clues=['Select a relay and probe it at the current load. A faulty relay passes at 1 but drops out at 2. Collect both readings before isolating it.'];v.controls=[select('trace','Relay under test',a.trace,feeds.map((x,i)=>opt(i,x))),button('probe','Probe selected relay'),select('isolate','Isolate relay',a.isolate,[opt(-1,'None'),...feeds.map((x,i)=>opt(i,x))])];v.readings=p.observations.flatMap((tests,i)=>tests.map(t=>reading('Relay '+feeds[i]+' at '+t.load+' units',t.output+' units out')));}
        if(r===2){v.clues=p.routes.map((k,i)=>'Relay '+feeds[i]+' serves '+k+'.');v.controls=[select('report','Fault destination report',a.report,p.routes.map(k=>opt(k)))];}break;
      case 2:powerView(v,p.power,r);break;
      case 3:{
        v.objective='Put the four unique fragments into their recovered transmission order.';
        const slots=[[0,3],[1],[2]][r];v.controls=slots.map(i=>select('slot'+i,'Fragment position '+(i+1),a['slot'+i],fragments.map(x=>opt(x))));
        v.clues=r===0?[p.answer[0]+' was sent before '+p.answer[1]+'.']:r===1?[p.answer[1]+' immediately preceded '+p.answer[2]+'.']:[p.answer[3]+' was last. '+p.answer[0]+' was first.'];
        v.readings=[reading('Current transmission',[0,1,2,3].map(i=>a['slot'+i]).join(' → '))];break;}
      case 4:tuneView(v,p,r);break;
      case 5:{
        const cell=i=>String.fromCharCode(65+i%4)+(1+Math.floor(i/4));
        v.objective='Reach '+cell(p.map.end)+' via BLUE then AMBER, avoid debris, and match fuel to the route length (max 8).';
        if(r===0){v.clues=['Fuel costs one unit per move, with at most 8 available. Debris in your scan: '+p.map.blocked.slice(0,3).map(cell).join(', ')+'.'];v.controls=[select('fuel','Route fuel',a.fuel,nums(0,8))];}
        if(r===1){v.clues=['BLUE is '+cell(p.map.beacons[0])+', AMBER is '+cell(p.map.beacons[1])+'. Visit BLUE first. Debris: '+p.map.blocked.slice(3).map(cell).join(', ')+'.'];v.controls=[select('beaconOrder','Beacon handshake',a.beaconOrder,[opt('BLUE-AMBER'),opt('AMBER-BLUE')])];}
        if(r===2){v.clues=['Grid columns A–D run left to right; rows 1–4 run top to bottom. Start '+cell(p.map.start)+', exit '+cell(p.map.end)+'. Ask the other stations for debris and beacon locations. Moves can be undone.'];v.controls=['north','east','south','west'].map(d=>button(d,'Move '+d));v.controls.push(button('undo','Undo last move'),button('clear','Clear route'));}
        v.readings=[reading('Plotted route',p.route.map(cell).join(' → ')),reading('Moves',p.route.length-1)];v.progress={step:p.route.length-1,total:8,label:'Fuel budget'};break;}
      case 6:
        v.objective='Stow all six crates so each bay weighs 4, following the special cargo rules.';
        v.controls=[r*2,r*2+1].map(i=>select('crate'+i,cargo[i]+' ('+weights[i]+' units)',a['crate'+i],nums(0,2).map(o=>opt(o.value,'Bay '+(Number(o.value)+1)))));
        v.clues=r===0?['Every bay needs 4 weight units. Sensor and Water must be in different bays.']:r===1?['Battery and Tools belong together in one bay.']:['Shield must be in Bay '+(p.restrictedBay+1)+'. Food must not share that bay.'];
        v.readings=[0,1,2].map(b=>reading('Bay '+(b+1)+' weight',sum(weights.filter((_,i)=>Number(a['crate'+i])===b))));break;
      case 7:sequenceView(v,p,r);break;
      case 8:{
        const path=networkPath(p);
        v.objective='Route a packet through SERVICE to HOME; match power to hops and phase to the relay signature.';
        if(r===0){v.clues=['Power costs one unit per hop. The maximum reserve is 6.'];v.controls=[select('power','Packet power',a.power,nums(0,6))];v.readings=[reading('Packet path',path.join(' → ')),reading('Hops',path.length-1)];}
        if(r===1){v.clues=['Set phase to (number of hops + '+p.offset+') modulo 3. The packet must visit SERVICE once.'];v.controls=[select('phase','Packet phase',a.phase,nums(0,2))];v.readings=[reading('Relay signature',(path.length-1+p.offset)%3)];}
        if(r===2){v.clues=['Branch A goes directly to the exit switch. Branch B goes through SERVICE, then RELAY. Branch C goes through DEBRIS. The exit switch sends either HOME or into a LOOP.'];v.controls=[select('branch','Ingress branch',a.branch,[opt(0,'A: direct'),opt(1,'B: service relay'),opt(2,'C: debris field')]),select('exit','Exit switch',a.exit,[opt(0,'LOOP'),opt(1,'HOME')])];v.readings=[reading('Packet path',path.join(' → '))];}break;}
      case 9:
        if(p.phase===0)powerView(v,p.power,r);
        else if(p.phase===1)tuneView(v,p,r);
        else sequenceView(v,p,r);
        v.progress={step:p.phase,total:3,label:['Repair final reserve','Establish final signal','Arm final launch'][p.phase]};
        v.submitInstruction='Engineering checks each phase. A verified phase stays saved while the crew works on the next one.';break;
    }
    v.readings.push(reading('System checks',c.checks));
    if(c.status!=='playing'){
      v.controls=[];v.check=null;
      v.progress={step:1,total:1,label:c.status==='complete'?'Mission complete':'Level verified'};
      v.submitInstruction=c.status==='complete'?'The escape pod is ready. Mission complete.':'Checkpoint saved. The coordinator chooses when to continue.';
      if(c.status==='checkpoint')v.next={label:'Continue to next level',coordinatorOnly:true};
    }
    return v;
  }
  function networkPath(p){const a=p.values;return ['START',...(a.branch==='0'?['JUNCTION']:a.branch==='1'?['SERVICE','RELAY','JUNCTION']:['DEBRIS','JUNCTION']),a.exit==='1'?'HOME':'LOOP'];}
  function powerError(p){if(p.isolate!==p.fault)return 'The fault lockout is not verified. Compare the suspect relay at low and high load.';const t=totals(p);if(terminals.some(k=>t[k]!==targets[k]))return 'The destinations are not balanced. Navigation can report which loads are low or high; isolated allocations still use reserve.';return '';}
  function tuneError(p){const a=p.values,t=p.target;if(Number(a.frequency)!==t.frequency)return 'The carrier is still noisy. Communications should compare the recovered carrier reference.';if(Number(a.gain)+Number(a.frequency)!==t.gain+t.frequency)return 'Amplifier energy disagrees. Engineering should combine the carrier frequency and gain.';if((Number(a.frequency)+Number(a.phase))%4!==(t.frequency+t.phase)%4)return 'The phase reference disagrees. Navigation should check the remainder after dividing by four.';return '';}
  function error(c){const p=c.puzzle,a=p.values;switch(c.level){
    case 0:if(sum(Object.values(a).map(Number))!==6)return 'The three systems need the full six-unit reserve. Compare Navigation’s targets with Communications’ wiring map.';return p.routes.some((k,i)=>Number(a['feed'+i])!==targets[k])?'Power reaches the wrong destinations. Match each feed to the wiring map.':'';
    case 1:if(![1,2].every(load=>p.observations[p.fault].some(t=>t.load===load)))return 'The diagnosis needs two readings from the same suspect relay: one at 1 unit and one at 2.';if(Number(a.isolate)!==p.fault)return 'The isolation choice disagrees with the measured dropout.';return a.report!==p.routes[p.fault]?'The fault destination report disagrees with Navigation’s wiring map.':'';
    case 2:return powerError(p.power);
    case 3:{const selected=[0,1,2,3].map(i=>a['slot'+i]);if(new Set(selected).size!==4)return 'A fragment is repeated. Use each recovered fragment exactly once.';return !eq(selected,p.answer)?'The order conflicts with a recovered timing clue. Compare first, last and the adjacent pair.':'';}
    case 4:return tuneError(p);
    case 5:{const m=p.map;if(p.route.at(-1)!==m.end)return 'The plotted route has not reached the exit.';const b=m.beacons.map(i=>p.route.indexOf(i));if(b.some(i=>i<0)||b[0]>=b[1]||a.beaconOrder!=='BLUE-AMBER')return 'The survey handshake requires BLUE before AMBER.';return Number(a.fuel)!==p.route.length-1?'Fuel must equal the plotted number of moves.':'';}
    case 6:{const bay=i=>Number(a['crate'+i]);if([0,1,2].some(b=>sum(weights.filter((_,i)=>bay(i)===b))!==4))return 'The pod is unbalanced. Each bay must carry exactly 4 weight units.';if(bay(0)===bay(1)||bay(2)!==bay(3)||bay(5)!==p.restrictedBay||bay(4)===p.restrictedBay)return 'Weight is balanced, but a cargo handling rule is still violated. Compare the stations’ notes.';return '';}
    case 7:return p.sequence.length===6?'':'The startup sequence is incomplete. Ask which prerequisite is ready next.';
    case 8:{const path=networkPath(p);if(path.includes('DEBRIS')||!path.includes('SERVICE')||path.at(-1)!=='HOME')return 'The packet route must cross SERVICE, avoid DEBRIS and arrive HOME.';if(Number(a.power)!==path.length-1)return 'Packet power must equal the number of hops in the selected path.';return Number(a.phase)!==(path.length-1+p.offset)%3?'Signal phase does not match this path’s relay signature.':'';}
    case 9:return p.phase===0?powerError(p.power):p.phase===1?tuneError(p):p.sequence.length===6?'':'The final startup sequence is incomplete.';
    default:return 'Mission complete';
  }}
  function apply(c,r,command){
    if(c.version!==VERSION)throw Error('Unsupported campaign version');
    if(c.status!=='playing')throw Error('This level is already verified. Wait for the coordinator to continue.');
    if(!Number.isInteger(r)||r<0||r>2)throw Error('Invalid station');
    const p=c.puzzle;
    if(command.type==='campaign-check'){
      if(r!==0)throw Error('Engineering runs the system check');
      c.checks++;const message=error(c);
      if(message)return {feedback:'Check '+c.checks+': '+message,solved:false};
      if(c.level===9&&p.phase<2){p.phase++;return {feedback:'Phase verified. '+(p.phase===1?'Establish the final signal.':'Coordinate the final startup.'),phaseChanged:true,solved:false};}
      c.completed.push({level:c.level,checks:c.checks});c.checkpoint={level:c.level,completed:c.completed.length};
      c.status=c.level===TOTAL-1?'complete':'checkpoint';
      if(c.status==='complete')c.level=TOTAL;
      return {feedback:c.status==='complete'?'Escape pod ready. Mission complete.':'Level verified. Checkpoint saved; the coordinator can continue when everyone is ready.',solved:true};
    }
    if(!['campaign-set','campaign-action'].includes(command.type)||typeof command.field!=='string'||typeof command.value!=='string')throw Error('Invalid campaign control');
    const control=view(c,r).controls.find(x=>x.field===command.field);
    if(!control||control.type!==(command.type==='campaign-set'?'select':'button'))throw Error('Invalid station control');
    if(control.type==='select'&&!control.options.some(o=>o.value===command.value)||control.type==='button'&&control.value!==command.value)throw Error('Invalid control value');
    if(command.type==='campaign-set'){
      const power=c.level===2||c.level===9&&p.phase===0?p.power:null;
      if(power){const n=Number(command.value);if(/^feed[0-3]$/.test(command.field)){const i=Number(command.field.slice(-1));if(sum(power.alloc)-power.alloc[i]+n>6)throw Error('Reserve exhausted. Reduce another feed first.');power.alloc[i]=n;}else if(command.field==='patch')power.patch=command.value;else power[command.field]=n;}
      else {if(c.level===0&&sum(Object.values(p.values).map(Number))-Number(p.values[command.field])+Number(command.value)>6)throw Error('Reserve exhausted. Reduce another feed first.');p.values[command.field]=command.value;}
      return {feedback:'',solved:false};
    }
    if(c.level===1&&command.field==='probe'){
      const i=Number(p.values.trace),load=Number(p.values.load);
      if(load===0)return {feedback:'The test supply is off. Ask Engineering to select 1 or 2 units.',solved:false};
      const measurement={load,output:i===p.fault&&load===2?0:load};
      p.observations[i]=p.observations[i].filter(t=>t.load!==load).concat([measurement]).sort((a,b)=>a.load-b.load);
      return {feedback:'Relay '+feeds[i]+' measurement recorded. Communications can compare its load readings.',solved:false};
    }
    if(c.level===5){
      if(command.field==='clear'){p.route=[p.map.start];return {feedback:'Route cleared. No fuel was spent.',solved:false};}
      if(command.field==='undo'){if(p.route.length>1)p.route.pop();return {feedback:'Last move undone. No fuel was spent.',solved:false};}
      const at=p.route.at(-1),x=at%4,y=Math.floor(at/4),delta={north:[0,-1],east:[1,0],south:[0,1],west:[-1,0]}[command.field],nx=x+delta[0],ny=y+delta[1],next=ny*4+nx;
      if(nx<0||nx>3||ny<0||ny>3)return {feedback:'That move leaves the survey grid. Try a different direction.',solved:false};
      if(p.map.blocked.includes(next))return {feedback:'Debris blocks that cell. Your route is unchanged; compare the scan notes.',solved:false};
      if(p.route.includes(next))return {feedback:'That cell is already in the route. Undo a move to change direction.',solved:false};
      if(p.route.length>=9)return {feedback:'The route uses the eight-unit fuel allowance. Undo or clear it to replot.',solved:false};
      p.route.push(next);return {feedback:'Route updated. This is a plan; no fuel has been spent.',solved:false};
    }
    if(c.level===7||c.level===9&&p.phase===2){
      if(p.sequence.includes(command.field))return {feedback:'That operation is already complete. The sequence is unchanged.',solved:false};
      if(operations[p.sequence.length]!==command.field)return {feedback:'Safety interlock: a prerequisite is missing. Compare the other stations’ sequence notes; completed steps are safe.',solved:false};
      p.sequence.push(command.field);return {feedback:opLabels[command.field]+' complete.',solved:false};
    }
    throw Error('Unknown campaign action');
  }
  function next(c){if(c.status!=='checkpoint'||c.level>=9)throw Error('No next level is ready');c.level++;c.status='playing';c.puzzle=makePuzzle(c.level,c.seed);c.checks=0;}
  function restart(c){if(c.status!=='playing')throw Error('Only an active level can be restarted');c.puzzle=makePuzzle(c.level,c.seed);c.checks=0;}
  function hints(c,count=0){if(c.views)return [...(c.hintTexts||[])];return Array.from({length:Number.isInteger(count)?Math.max(0,Math.min(2,count)):0},(_,i)=>hintText(c,i));}
  function hintText(c,index){const level=Math.min(c.level,9),p=c.puzzle;
    const pairs=[
      ['Compare feed destinations from Communications with Navigation’s exact target loads.','The targets total six: K7 gets 2, M4 gets 3, R2 gets 1. Allocate those loads to the matching feeds.'],
      ['Probe the same relay at one unit and then two; the defective one changes behavior.','Record both loads on the dropping relay, isolate it, and have Navigation report the destination shown on its map.'],
      ['A powered faulty relay drops out above one unit. The spare can replace its destination.','Isolate the faulty fixed feed and set it to zero. Patch the spare to that destination, then allocate 2, 3 and 1 to K7, M4 and R2.'],
      ['Find the fixed first and last fragments, then place the adjacent middle pair.','Combine Navigation’s two endpoints with Communications’ immediately-preceded pair. Each fragment appears once.'],
      ['First establish a clean carrier. Use it in the other stations’ two equations.','Gain is the energy target minus carrier. Try the four phase positions against the modulo-four reference.'],
      ['Collect both debris lists before plotting. Pass BLUE before AMBER; every move costs one fuel.','Undo dead ends freely. At the exit, set fuel to the number of moves shown, with a BLUE-AMBER handshake.'],
      ['The two 2-unit crates can fill one bay together. Each 3-unit crate needs one 1-unit partner.','Put Shield in its required bay with either Sensor or Water. Put Food with the other 1-unit crate. Keep Battery and Tools together.'],
      ['Each operation depends on a previous station’s step; start with coolant.','The order is coolant, vent, release latch, prime engine, align beacon, arm launch.'],
      ['Trace the selected branch. It must include SERVICE and end at HOME before tuning power or phase.','Use the service branch and HOME exit. Power equals hops; phase is (hops + the Communications offset) modulo three.'],
      ['Solve one phase at a time: repair the reserve, tune the signal, then coordinate startup.','Repair: isolate and bypass the fault. Signal: carrier, energy, then phase. Startup: coolant, vent, latch, prime, align, arm.']
    ];return pairs[level][index];
  }
  function project(c,roles,hintCount=0){return {version:c.version,seed:c.seed,level:c.level,total:TOTAL,status:c.status,completed:clone(c.completed),checkpoint:clone(c.checkpoint),checks:c.checks,views:Object.fromEntries(roles.map(r=>[r,view(c,r)])),hintTexts:Array.from({length:Math.min(2,hintCount)},(_,i)=>hintText(c,i))};}
  return {VERSION,TOTAL,SEEDS,create,view,hints,apply,next,restart,project};
})();
