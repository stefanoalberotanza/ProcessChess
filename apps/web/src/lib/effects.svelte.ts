/** Sound and animation switch, remembered across sessions. */
const KEY = 'pc.effects';

function load(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'false';
  } catch {
    return true; // storage unavailable: the default
  }
}

function save(on: boolean) {
  try {
    localStorage.setItem(KEY, String(on));
  } catch {
    // storage unavailable: the choice lasts for this session only
  }
}

class Effects {
  on = $state(load());

  toggle() {
    this.on = !this.on;
    save(this.on);
  }
}

export const effects = new Effects();
