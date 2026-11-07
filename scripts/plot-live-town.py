"""Plot an audited live-town run; never calls a model provider."""
import json
import sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

source=Path(sys.argv[1] if len(sys.argv)>1 else 'docs/results/live-town-summary.json')
data=json.loads(source.read_text(encoding='utf-8'))
bundle=json.loads(source.with_name('live-town-run-v1.json').read_text(encoding='utf-8'))
calls=[call for report in bundle['observations'] for call in report['calls']]
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False,'axes.labelcolor':'#435348','text.color':'#35483d','xtick.color':'#607161','ytick.color':'#607161','axes.edgecolor':'#c5cfbc','figure.facecolor':'#faf7ec','axes.facecolor':'#faf7ec'})
fig,(ax,usage)=plt.subplots(1,2,figsize=(12.5,4.6),gridspec_kw={'width_ratios':[1,1.45]})
rounds=[point['round'] for point in data['metrics']]
ax.plot(rounds,[point['reached'] for point in data['metrics']],marker='o',color='#7e9152',lw=2.5,label='Reached (including initial holders)')
ax.plot(rounds,[point['reliable'] for point in data['metrics']],marker='s',color='#2e604c',lw=2,label='Reliable-source holders')
ax.set(xlabel='Committed segment',ylabel='Residents',xticks=rounds,yticks=range(5),ylim=(0,4))
ax.set_title('A / A rumor travels; the notice does not',loc='left',fontsize=11,fontweight='bold',pad=16)
ax.legend(loc='upper left',frameon=False,fontsize=8)
ax.grid(axis='y',alpha=.15)
x=np.arange(1,len(calls)+1)
prompt=[call['response']['usage']['prompt_tokens'] for call in calls]
completion=[call['response']['usage']['completion_tokens'] for call in calls]
usage.bar(x,prompt,color='#a5b385',label='Input tokens',width=.65)
usage.bar(x,completion,bottom=prompt,color='#d0a36d',label='Output tokens',width=.65)
usage.set(xlabel='Actual request / resident',ylabel='Provider-reported tokens',xticks=x,xticklabels=[f'{i}\n{call["residentId"].title()}' for i,call in enumerate(calls,1)])
usage.set_title('B / Nine audited calls, no rule substitution',loc='left',fontsize=11,fontweight='bold',pad=16)
usage.legend(loc='upper left',frameon=False,fontsize=8,ncol=2)
usage.grid(axis='y',alpha=.12)
fig.suptitle(f'Whisperville · live-town-v1 · {data["model"]}',x=.06,ha='left',fontsize=17,fontweight='bold')
fig.text(.06,.875,f'{data["calls"]} calls · {data["dialogueTurns"]} utterances · {data["usage"]["total_tokens"]:,} tokens · {data["wallSeconds"]:.3f}s across the recorded run',color='#7c875f',fontsize=10)
fig.text(.06,.035,'Single trace, seed 42. Only Lin and Mia made model decisions; 23 residents remained pending. No control condition.',fontsize=8,color='#7c806c')
fig.subplots_adjust(left=.065,right=.975,top=.76,bottom=.2,wspace=.32)
destination=Path('docs/assets/live-town-result')
fig.savefig(destination.with_suffix('.png'),dpi=160)
fig.savefig(destination.with_suffix('.svg'))
print(str(destination.with_suffix('.png')))
