// EffectChainManager.js: менеджер для управления цепочкой аудиоэффектов
// Позволяет добавлять, удалять, перемещать эффекты и пересобирать аудио-цепочку

export class EffectChainManager {
  // Конструктор принимает аудиоконтекст и селектор контейнера для эффектов
  constructor(audioContext, containerSelector = '#effects-container') {
    this.audioContext = audioContext; // Сохраняем аудиоконтекст
    this.container = document.querySelector(containerSelector); // Контейнер для DOM-элементов эффектов
    this.effectChain = []; // Массив для хранения всех эффектов в цепочке
    this.idCounter = 1; // Счётчик для уникальных id
  }

  // Метод для добавления нового эффекта
  async addEffect(effectName, index = this.effectChain.length) {
    // 1. Загружаем HTML-файл эффекта через fetch
    const response = await fetch(`effects/${effectName}.html`);
    const html = await response.text();

    // 2. Создаём DOM-обёртку для эффекта
    const wrapper = document.createElement('div');
    wrapper.className = 'effect-instance';
    const effectId = `fx-${effectName.toLowerCase()}-${this.idCounter++}`;
    wrapper.dataset.effectId = effectId;
    wrapper.innerHTML = html;

    // 3. Вставляем DOM-элемент в контейнер по нужному индексу
    if (index >= this.container.children.length) {
      this.container.appendChild(wrapper);
    } else {
      this.container.insertBefore(wrapper, this.container.children[index]);
    }

    // 4. Динамически импортируем JS-класс эффекта
    const module = await import(`../effects/${effectName}.js`);
    const EffectClass = module[effectName];

    // 5. Создаём экземпляр эффекта, передаём аудиоконтекст и DOM-элемент
    const effectInstance = new EffectClass(this.audioContext, wrapper);

    // 6. Добавляем объект эффекта в массив цепочки
    const effectObj = {
      id: effectId,
      name: effectName,
      dom: wrapper,
      audioNode: effectInstance
    };
    this.effectChain.splice(index, 0, effectObj);
    this.rebuildAudioChain(); // Пересобираем аудио-цепочку
    return effectObj; // Возвращаем объект эффекта
  }

  // Метод для удаления эффекта
  removeEffect(effectObjOrId) {
    // Находим индекс эффекта по объекту или id
    const idx = typeof effectObjOrId === 'string'
      ? this.effectChain.findIndex(e => e.id === effectObjOrId)
      : this.effectChain.indexOf(effectObjOrId);
    if (idx === -1) return;
    const effectObj = this.effectChain[idx];
    // Вызываем destroy у эффекта, если реализовано
    if (effectObj.audioNode && typeof effectObj.audioNode.destroy === 'function') {
      effectObj.audioNode.destroy();
    }
    // Удаляем DOM-элемент
    if (effectObj.dom && effectObj.dom.parentNode) {
      effectObj.dom.parentNode.removeChild(effectObj.dom);
    }
    // Удаляем из массива
    this.effectChain.splice(idx, 1);
    this.rebuildAudioChain(); // Пересобираем цепочку
  }

  // Метод для перемещения эффекта в цепочке
  moveEffect(effectObjOrId, newIndex) {
    const idx = typeof effectObjOrId === 'string'
      ? this.effectChain.findIndex(e => e.id === effectObjOrId)
      : this.effectChain.indexOf(effectObjOrId);
    if (idx === -1 || newIndex < 0 || newIndex >= this.effectChain.length) return;
    const [effectObj] = this.effectChain.splice(idx, 1);
    this.effectChain.splice(newIndex, 0, effectObj);
    // Перемещаем DOM-элемент
    if (newIndex >= this.container.children.length) {
      this.container.appendChild(effectObj.dom);
    } else {
      this.container.insertBefore(effectObj.dom, this.container.children[newIndex]);
    }
    this.rebuildAudioChain();
  }

  // Метод для пересборки аудио-цепочки
  rebuildAudioChain() {
    // Отключаем все эффекты
    for (const effect of this.effectChain) {
      if (effect.audioNode && typeof effect.audioNode.disconnect === 'function') {
        effect.audioNode.disconnect();
      }
    }

    // Соединяем эффекты друг с другом
    for (let i = 0; i < this.effectChain.length - 1; i++) {
      const currentEffect = this.effectChain[i];
      const nextEffect = this.effectChain[i + 1];

      if (currentEffect.audioNode && nextEffect.audioNode && typeof currentEffect.audioNode.connect === 'function') {
        currentEffect.audioNode.connect(nextEffect.audioNode);
      }
    }

    if (this.effectChain.length > 0) {
      const lastEffect = this.effectChain[this.effectChain.length - 1];
      if (lastEffect.audioNode && typeof lastEffect.audioNode.connect === 'function') {
        lastEffect.audioNode.connect(this.audioContext.destination);
      }
    }

    console.log("Audio chain rebult: ", this.effectChain.map(e => e.name));
  }

  // Получить эффект по id
  getEffectById(id) {
    return this.effectChain.find(e => e.id === id);
  }

  // Получить копию массива всех эффектов
  getEffects() {
    return this.effectChain.slice();
  }

  // Удалить все эффекты из цепочки
  clear() {
    while (this.effectChain.length > 0) {
      this.removeEffect(this.effectChain[0]);
    }
  }
}