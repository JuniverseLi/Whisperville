import { CLAIMS, SCENARIO, residentById } from '../simulation/scenario.js';

const GREETINGS = {
  lin: '欢迎来耳语镇！咖啡刚煮好。你知道吗？刚才有人说，学校明天可能停课……也不知道准不准。',
  mei: '你好呀，我正想着孩子明天的安排。镇上有人在说学校的事，你听到什么了吗？',
  zhou: '来看看今天的花吧。小镇上的消息总像花粉一样，风一吹就到处都是。',
  qiao: '你是新来的邻居吧？我是耳语小学的老师乔安。有什么想问的，尽管说。',
  tang: '新面孔！我以前给镇上的人送信，哪条小路都熟。别着急，慢慢逛。',
  chen: '嘿，欢迎！自行车需要修的话就来找我。我刚在街上听到一件新鲜事。',
  xu: '欢迎来图书馆。看书不用急着翻到结尾，听消息也是一样。',
  bo: '我是社区报社的阿柏。你刚搬来？如果发现什么有意思的事，记得来告诉我。',
};

export function replyToPlayer(game, id, topic, player, activity = '在忙自己的事情') {
  const resident = residentById(id),
    belief = game.residents[id];
  if (!resident) return { text: '这里暂时没有人。' };
  if (topic === 'greet')
    return {
      text:
        belief.verified && id === 'lin'
          ? '欢迎来耳语镇！咖啡刚煮好。学校的消息我已经核实过了，明天照常上课。来，坐坐再走。'
          : GREETINGS[id],
      visited: id,
      talkedLin: id === 'lin',
    };
  if (topic === 'work') return { text: `${activity}。${resident.trait}有空再一起聊聊吧。` };
  if (topic === 'school') {
    if (id === 'qiao')
      return {
        text: `我看过校务处的通知：${SCENARIO.fact}只是操场维护，被传成停课了。我给你一份公告，你也可以拿给邻居看看。`,
        hasNotice: true,
        journal: '乔安确认：学校明天正常上课，只有操场维护；你拿到了校务公告。',
      };
    if (belief.verified)
      return {
        text: `我已经看过公告了：${SCENARIO.fact}你也可以去学校找乔安确认。`,
        journal: `${resident.name}已知道：${CLAIMS[0].text}。`,
      };
    if (belief.claim === null)
      return {
        text: '我还没听说学校的事。你可以去耳语小学找乔安，她是那里的老师。',
        journal: `${resident.name}还没听说学校的消息。`,
      };
    const message = game.messages.find((item) => item.id === belief.messageId);
    const sender = residentById(message?.sender);
    return {
      text: `${sender ? `${sender.name}跟我说，` : '我听到的说法是，'}${CLAIMS[belief.claim].text}。你觉得这事是真的吗？去问问乔安比较好。`,
      journal: `${resident.name}听到的说法：${CLAIMS[belief.claim].text}。`,
    };
  }
  if (topic === 'share') {
    if (!player.hasNotice) return { text: '如果有校务处的原始公告就好了。去学校找乔安问问吧。' };
    if (belief.verified)
      return {
        text: '谢谢你特意跑来！我也已经知道学校正常上课了。我们一起把消息说清楚吧。',
        shared: id,
        journal: `你和${resident.name}核对了校务公告。`,
      };
    if (game.remaining < 1)
      return { text: '你的三份公告复印件已经交出去了。谢谢你帮忙，接下来看看邻居们会怎么转述吧。' };
    return {
      text: '原来是这样！明天照常上课，只关闭操场。谢谢你把公告拿来，我会记住，也会告诉遇见的邻居。',
      shared: id,
      intervene: true,
      journal: `你向${resident.name}出示了校务公告，纠正了停课的说法。`,
    };
  }
  return { text: '回头见，慢慢逛！' };
}
