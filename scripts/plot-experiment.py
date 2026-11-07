"""Render an exported rule experiment with reproducible bootstrap bands."""
import argparse
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('report',type=Path)
parser.add_argument('--output',type=Path,default=Path('output/experiments/figure'))
args=parser.parse_args()
report=json.loads(args.report.read_text(encoding='utf-8'))
assert report['mode']=='rules-only-abstract-network'
names={'none':'No additional notice','random':'Random recipient','degree':'Highest out-degree','bridge':'Highest betweenness'}
colors={'none':'#8b8371','random':'#b9803c','degree':'#467e99','bridge':'#6b854b'}
config=report['config'];rng=np.random.default_rng(config['seedStart'])
draws=rng.integers(0,config['seeds'],size=(1000,config['seeds']))
fig,(curve,effects)=plt.subplots(1,2,figsize=(12,5),gridspec_kw={'width_ratios':[1.6,1]},layout='constrained')
for group in report['summary']:
    policy=group['policy']
    trials=sorted((t for t in report['trials'] if t['policy']==policy),key=lambda t:t['seed'])
    values=np.array([[p['corrected']/report['population']*100 for p in t['history']] for t in trials])
    samples=values[draws].mean(axis=1);low,high=np.quantile(samples,[.025,.975],axis=0)
    x=np.arange(config['rounds']+1)
    curve.plot(x,values.mean(axis=0),label=names[policy],color=colors[policy],linestyle='--' if policy=='none' else '-',linewidth=2)
    curve.fill_between(x,low,high,color=colors[policy],alpha=.10)
curve.axvline(config['interventionRound'],color='#aaa08a',linestyle=':',linewidth=1)
curve.set(xlabel='Simulation segment',ylabel='Reliable-source coverage (%)',ylim=(0,100),title='Matched seeds and a fixed contact graph')
curve.legend(loc='upper left',fontsize=8,frameon=False)
for index,pair in enumerate(report['paired']):
    d=pair['difference'];mean,lo,hi=[d[k]*100 for k in ['mean','low','high']]
    effects.errorbar(mean,index,xerr=[[mean-lo],[hi-mean]],fmt='o',capsize=5,color=colors[pair['policy']],markersize=7)
effects.axvline(0,color='#aaa08a',linestyle=':',linewidth=1)
effects.set(yticks=[0,1],yticklabels=['Out-degree - random','Betweenness - random'],xlabel='Paired difference in time-averaged coverage (pp)',title='95% paired bootstrap intervals',ylim=(-.6,1.6))
for axis in [curve,effects]:
    axis.spines[['top','right']].set_visible(False)
    axis.grid(axis='y',color='#e8e4db',linewidth=.7)
fig.suptitle(f"Whisperville rule baseline | {config['seeds']} paired seeds | {report['population']} residents",fontsize=13)
fig.text(.01,-.025,'Engine-defined source protection; abstract contacts; no LLM calls, map travel or training. Bands describe simulated-seed variation.',fontsize=8,color='#666666')
args.output.parent.mkdir(parents=True,exist_ok=True)
for extension in ['png','svg']:
    fig.savefig(args.output.with_suffix('.'+extension),dpi=180,bbox_inches='tight')
print(f'Wrote {args.output}.png and .svg')
