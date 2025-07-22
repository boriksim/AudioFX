// DelayEffect.js: класс для эффекта задержки (Delay)
// Наследуется от AbstractEffectNode
import AbstractEffectNode from '../core/AbstractEffectNode.js';

export class DelayEffect extends AbstractEffectNode {
  constructor(audioContext, domElement) {
    // Вызываем конструктор родителя
    super(audioContext, domElement);

    // Создаём аудио-ноду задержки
    this.delayNode = audioContext.createDelay(2.0);
    this.delayNode.delayTime.value = 0.5;

    this.input.connect(this.delayNode);
    this.delayNode.connect(this.effectOutput);

    this.setMix(0.5);
    this.bypass = false;
  }

  // Метод для инициализации UI и навешивания обработчиков
  initUI() {
    // Находим ползунок по data-атрибуту
    this.delayTimeSlider = this.domElement.querySelector('[data-fx-delay_time]');
    this.delayTimeValue = this.domElement.querySelector('[data-fx-delay_time-value]');
    // Находим кнопку bypass
    this.bypassCheckbox = this.domElement.querySelector('[data-fx-bypass]');

    // Обработчик изменения значения ползунка
    this.delayTimeSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.setParam('delayTime', value);
      // Обновляем отображение значения
      if (this.delayTimeValue) this.delayTimeValue.textContent = value;
    });

    // Обработчик кнопки bypass
    this.bypassCheckbox.addEventListener('click', () => {
      this.setParam('bypass', !this.bypass);
    });
  }

  // Метод для установки параметров эффекта
  setParam(paramName, value) {
    if (paramName === 'delayTime') {
      this.delayNode.delayTime.value = value;
    } else if (paramName === 'bypass') {
      this.bypass = value;
      // Здесь можно реализовать логику обхода эффекта (например, отключать ноду)
    }
    console.log("setParam", paramName, value);
  }

  // Метод для получения текущего значения параметра
  getParam(paramName) {
    if (paramName === 'delayTime') {
      return this.delayNode.delayTime.value;
    } else if (paramName === 'bypass') {
      return this.bypass;
    }
    return undefined;
  }

  // Метод для очистки (например, при удалении эффекта)
  destroy() {
    // Удаляем обработчики событий
    if (this.delayTimeSlider) {
      this.delayTimeSlider.replaceWith(this.delayTimeSlider.cloneNode(true));
    }
    if (this.bypassCheckbox) {
      this.bypassCheckbox.replaceWith(this.bypassCheckbox.cloneNode(true));
    }
    // Отключаем аудио-ноду
    if (this.delayNode) {
      this.delayNode.disconnect();
    }
  }
}