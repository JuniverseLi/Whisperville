"""Plot recorded task outcomes, not a success-rate estimate across tasks."""
import argparse
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('report',type=Path)
parser.add_argument('--output',type=Path,default=Path('docs/assets/live-pilot-result'))
args=parser.parse_args()
report=json.loads(args.report.read_text(encoding='utf-8'))
assert report['status']=='completed' and report['mode']=='live-api'
trials=report['trials'];assert len(trials)==2
fig,(outcomes,usage)=plt.subplots(1,2,figsize=(11,4.1),gridspec_kw={'width_ratios':[1.35,1]},layout='constrained')
colors=['#6b854b','#b9aa88'];labels=['Communication','No communication']
correct=[len(t['score']['correctAgents']) for t in trials]
outcomes.barh(labels,correct,color=colors,height=.45)
for i,value in enumerate(correct):outcomes.text(value+.12,i,f'{value} / 4',va='center',fontsize=12,color='#46513c')
outcomes.set(xlim=(0,4.9),xticks=[0,1,2,3,4],xlabel='Residents submitting the exact answer',title='One task instance, paired conditions')
outcomes.invert_yaxis()
inputs=sum(c['response']['usage']['prompt_tokens'] or 0 for c in report['calls'])
outputs=sum(c['response']['usage']['completion_tokens'] or 0 for c in report['calls'])
usage.bar(['Input','Output'],[inputs,outputs],color=['#a5b997','#607e67'],width=.5)
for i,value in enumerate([inputs,outputs]):usage.text(i,value+220,f'{value:,}',ha='center',fontsize=11,color='#46513c')
usage.set(ylim=(0,max(inputs,outputs)*1.25),ylabel='Provider-reported tokens',title=f"{len(report['calls'])} actual API calls · {inputs+outputs:,} tokens")
for ax in [outcomes,usage]:
    ax.spines[['top','right']].set_visible(False)
    ax.tick_params(labelsize=10)
fig.suptitle(f"Whisperville · {report['model']} · private-information pilot",fontsize=13)
fig.text(.01,-.03,'One seed, four residents, two rounds. No communication means incomplete information. No statistical superiority claim; no training.',fontsize=8,color='#666666')
args.output.parent.mkdir(parents=True,exist_ok=True)
for ext in ['png','svg']:fig.savefig(args.output.with_suffix('.'+ext),dpi=180,bbox_inches='tight')
print(f'Wrote {args.output}.png and .svg')
