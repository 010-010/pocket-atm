const APP_VERSION = '1.3.0';

const pushLocalNotification = function(text) {
  window.Notification.requestPermission().then(function(result) {
    var notification = new window.Notification(text);
      notification.onclick = function(event) {
        if (window.navigator.mozApps) {
          var request = window.navigator.mozApps.getSelf();
          request.onsuccess = function() {
            if (request.result) {
              notification.close();
              request.result.launch();
            }
          };
        } else {
          window.open(document.location.origin, '_blank');
        }
      }
      notification.onshow = function() {
        notification.close();
      }
  });
}

function nFormatter(num) {
  if (num >= 1000000000000) {
    return (num / 1000000000000).toFixed(1).replace(/\.0$/, '') + 'T';
  }
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B'; // G
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(2).replace(/\.0$/, '') + 'K';
  }
  return num.toFixed(2);
}

window.addEventListener("load", function() {

  let STORAGE_TYPE = window.localStorage.getItem('STORAGE_TYPE');
  STORAGE_TYPE = [localforage.LOCALSTORAGE, localforage.INDEXEDDB].indexOf(STORAGE_TYPE) > -1 ? STORAGE_TYPE : localforage.LOCALSTORAGE
  console.log('STORAGE_TYPE', STORAGE_TYPE);
  localforage.setDriver(STORAGE_TYPE);

  const state = new KaiState({
    'unit': '$',
    'total_balance': 0,
    'total_deposit': 0,
    'total_withdraw': 0,
    'deficit_spending': false,
  });

  localforage.getItem('__deficit_spending__')
  .then((__deficit_spending__) => {
    if (!__deficit_spending__) {
      __deficit_spending__ = false;
      state.setState('deficit_spending', __deficit_spending__);
      localforage.setItem('__deficit_spending__', __deficit_spending__);
    }
    state.setState('deficit_spending', __deficit_spending__);
  });

  localforage.getItem('__unit__')
  .then((__unit__) => {
    if (!__unit__) {
      __unit__ = '$';
      state.setState('unit', __unit__);
      localforage.setItem('__unit__', __unit__);
    }
    state.setState('unit', __unit__);
  });

  localforage.getItem('__logs__')
  .then((__logs__) => {
    if (!__logs__) {
      localforage.setItem('__logs__', []);
      state.setState('total_balance', 0);
      state.setState('total_deposit', 0);
      state.setState('total_withdraw', 0);
    } else {
      var total_balance = 0;
      var total_deposit = 0;
      var total_withdraw = 0;
      __logs__.forEach((log) => { // log {date, type, value, note} -> type 0(withdraw) 1(deposit)
        if (log.type === 0) {
          total_withdraw += log.value;
        } if (log.type === 1) {
          total_deposit += log.value;
        }
      });
      total_balance = total_deposit - total_withdraw;
      state.setState('total_balance', total_balance);
      state.setState('total_deposit', total_deposit);
      state.setState('total_withdraw', total_withdraw);
    }
  });

  function commitTransaction(date, type, value, note = '') {
    try {
      value = JSON.parse(value);
      if (value <= 0 && !isNaN(value)) {
        return Promise.reject('Amount must greater than 0');
      }
      return localforage.getItem('__logs__')
      .then((__logs__) => {
        var total_balance = 0;
        var total_deposit = 0;
        var total_withdraw = 0;
        __logs__.forEach((log) => { // log {date, type, value, note} -> type 0(withdraw) 1(deposit)
          if (log.type === 0) {
            total_withdraw += log.value;
          } if (log.type === 1) {
            total_deposit += log.value;
          }
        });
        total_balance = total_deposit - total_withdraw;
        if (value > total_balance && !state.getState('deficit_spending') && type === 0) {
          return Promise.reject('Insufficient Balance');
        } else {
          var data = { date: date, type: type, value: value, note: note };
          __logs__.push(data);
          return localforage.setItem('__logs__', __logs__)
          .then(() => {
            total_balance = 0;
            total_deposit = 0;
            total_withdraw = 0;
            __logs__.forEach((log) => { // log {date, type, value, note} -> type 0(withdraw) 1(deposit)
              if (log.type === 0) {
                total_withdraw += log.value;
              } if (log.type === 1) {
                total_deposit += log.value;
              }
            });
            total_balance = total_deposit - total_withdraw;
            state.setState('total_balance', total_balance);
            state.setState('total_deposit', total_deposit);
            state.setState('total_withdraw', total_withdraw);
          });
        }
      })
      .then(() => {
        return Promise.resolve('Transaction Done');
      })
      .catch((err) => {
        return Promise.reject(err);
      });
    } catch(e) {
      return Promise.reject('Invalid amount');
    }
  }

  window['commitTransaction'] = commitTransaction; // debug purpose

  const dummy = new Kai({
    name: '_dummy_',
    data: {
      title: '_dummy_'
    },
    verticalNavClass: '.transNav',
    templateUrl: document.location.origin + '/templates/dummy.html',
    mounted: function() {},
    unmounted: function() {},
    methods: {},
    softKeyText: { left: 'L2', center: 'C2', right: 'R2' },
    softKeyListener: {
      left: function() {},
      center: function() {},
      right: function() {}
    },
    dPadNavListener: {
      arrowUp: function() {
        this.navigateListNav(-1);
      },
      arrowDown: function() {
        this.navigateListNav(1);
      }
    }
  });

  const transaction_logs = new Kai({
    name: 'transaction_logs',
    data: {
      title: 'transaction_logs',
      logs_length: 0,
      begin: new Date().getTime(),
      _begin: new Date().toLocaleDateString(),
      _sr_begin: '',
      end: new Date().getTime(),
      _end: new Date().toLocaleDateString(),
      _sr_end: '',
      logs: [],
      total_withdraw: 0,
      total_deposit: 0,
      unit: '$',
    },
    verticalNavClass: '.transNav',
    templateUrl: document.location.origin + '/templates/transaction_logs.html',
    mounted: function() {
      this.data.unit = this.$state.getState('unit');
      this.$router.setHeaderTitle('Transaction History(0)');
      this.methods.getTransaction();
      document.addEventListener('keydown', this.methods.exportTransaction);
    },
    unmounted: function() {
      document.removeEventListener('keydown', this.methods.exportTransaction);
    },
    methods: {
      exportTransaction: function(evt) {
        if (evt.key == 'Call') {
          let csvText = "ID;Date;Amount;Note";
          this.data.logs.forEach(item => {
            csvText += `\n${item.date};${item._date};${item.type == 0 ? 0 - item.value : item.value};${item.note}`
          });
          const csvBlob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
          const filename = `Transaction_${new Date(this.data.begin).toDateString()}_${new Date(this.data.end).toDateString()}.csv`;
          saveAs(csvBlob, filename);
        }
      },
      getTransaction: function() {
        var begin = new Date(this.data.begin);
        begin.setHours(0);
        begin.setMinutes(0);
        begin.setSeconds(0);
        begin.setMilliseconds(0);
        var end = new Date(this.data.end);
        end.setHours(23);
        end.setMinutes(59);
        end.setSeconds(59);
        end.setMilliseconds(999);
        this.setData({
          _sr_begin: begin.toDateString(),
          _sr_end: end.toDateString(),
          _begin: begin.toLocaleDateString(),
          _end: end.toLocaleDateString(),
          total_withdraw: 0,
          total_deposit: 0,
        });
        if (end.getTime() - begin.getTime() > 0) {
          this.verticalNavIndex = -1;
          localforage.getItem('__logs__')
          .then((__logs__) => {
            if (!__logs__) {
              __logs__ = [];
            }
            var total_withdraw = 0;
            var total_deposit = 0;
            var logs = [];
            var idx = 1;
            __logs__.forEach((l) => {
              if (l['date'] >= begin.getTime() && l['date'] <= end.getTime()) {
                l['idx'] = idx;
                l['_date'] = new Date(l['date']).toDateString();
                l['_type'] = l['type'] === 1 ? 'Deposit' : 'Withdraw';
                if (l['type'] === 1) {
                  total_deposit += l['value'];
                } else {
                  total_withdraw += l['value'];
                }
                l['_note'] = l['note'].length > 0 ? ' Press Enter to listen for transaction notes,' : '';
                logs.push(l);
                idx++;
              }
            });
            this.setData({
              logs: logs,
              total_withdraw: total_withdraw,
              total_deposit: total_deposit,
              logs_length: logs.length,
            });
            if (logs.length > 0) {
              this.verticalNavIndex = -1;
              this.dPadNavListener.arrowDown();
            }
            this.$router.setHeaderTitle(`Transaction History(${logs.length})`);
          });
        } else {
          this.$router.setHeaderTitle('Transaction History(0)');
        }
      },
      renderCenterText: function() {
        if (this.verticalNavIndex > -1) {
          const selected = this.data.logs[this.verticalNavIndex - 1];
          if (selected && selected['note'].length > 0) {
            this.$router.setSoftKeyCenterText('NOTE');
          } else {
            this.$router.setSoftKeyCenterText('');
          }
        } else {
          this.$router.setSoftKeyCenterText('');
        }
      }
    },
    softKeyText: { left: 'Begin', center: '', right: 'End' },
    softKeyListener: {
      left: function() {
        var d = new Date(this.data.begin);
        this.$router.showDatePicker(d.getFullYear(), d.getMonth() + 1, d.getDate(), (dt) => {
          this.setData({ begin: dt.getTime() });
          this.methods.getTransaction();
        }, () => {
          setTimeout(this.methods.renderCenterText, 100);
        });
      },
      center: function() {
        const selected = this.data.logs[this.verticalNavIndex - 1];
        if (selected && selected['note'].length > 0) {
          //pushLocalNotification(selected['note'] + ', press Left key to return');
          this.$router.showDialog('Note', `<div class="kai-list-nav"><span class="sr-only">Listen for note. ${selected['note']}. Press Left Key to close,</span><span aria-hidden="true">${selected['note']}</span></div>`, null, ' ', () => {}, 'Close', () => {}, ' ', null, () => {
          setTimeout(this.methods.renderCenterText, 100);
        });
        }
      },
      right: function() {
        var d = new Date(this.data.end);
        this.$router.showDatePicker(d.getFullYear(), d.getMonth() + 1, d.getDate(), (dt) => {
          this.setData({ end: dt.getTime() });
          this.methods.getTransaction();
        }, () => {
          setTimeout(this.methods.renderCenterText, 100);
        });
      }
    },
    dPadNavListener: {
      arrowUp: function() {
        this.navigateListNav(-1);
        this.methods.renderCenterText();
      },
      arrowDown: function() {
        this.navigateListNav(1);
        this.methods.renderCenterText();
      }
    }
  });

  const commitWithdrawOrDeposit = function($router, type = true) { // true=deposit, false=withdraw
    $router.push(
      new Kai({
        name: 'form',
        data: {
          amount: '',
          note: '',
          type: type ? 'deposit' : 'withdraw'
        },
        verticalNavClass: '.formNav',
        templateUrl: document.location.origin + '/templates/form.html',
        mounted: function() {
          this.$router.setHeaderTitle(`${type ? 'Deposit' : 'Withdraw'}`);
          document.addEventListener('keydown', this.methods.listenCallButton);
        },
        unmounted: function() {
          document.removeEventListener('keydown', this.methods.listenCallButton);
        },
        methods: {
          listenCallButton: function(evt) {
            if (evt.key == 'Call' && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
              if (document.activeElement.value || document.activeElement.value != '') {
                pushLocalNotification(`Input value is ${document.activeElement.value}`);
              }
            }
          },
          submit: function() {
            commitTransaction(new Date().getTime(), type ? 1 : 0, document.getElementById('amount').value, document.getElementById('note').value.trim())
            .then((success) => {
              document.getElementById('amount').value = '';
              document.getElementById('note').value = '';
              pushLocalNotification(success.toString());
              //$router.showToast(success.toString());
              setTimeout(() => {
                $router.pop();
              }, 3000);
            })
            .catch((err) => {
              pushLocalNotification(err.toString());
              //$router.showToast(err.toString());
            });
          }
        },
        softKeyText: { left: '', center: '', right: '' },
        softKeyListener: {
          left: function() {},
          center: function() {
            const listNav = document.querySelectorAll(this.verticalNavClass);
            if (this.verticalNavIndex > -1) {
              if (listNav[this.verticalNavIndex]) {
                listNav[this.verticalNavIndex].click();
              }
            }
          },
          right: function() {}
        },
        dPadNavListener: {
          arrowUp: function() {
            this.navigateListNav(-1);
          },
          arrowDown: function() {
            this.navigateListNav(1);
          }
        }
      })
    );
  }

  const changelogs = new Kai({
    name: 'changelogs',
    data: {
      title: 'changelogs'
    },
    templateUrl: document.location.origin + '/templates/changelogs.html',
    mounted: function() {
      this.$router.setHeaderTitle('Changelogs');
    },
    unmounted: function() {},
    methods: {},
    softKeyText: { left: '', center: '', right: '' },
    softKeyListener: {
      left: function() {},
      center: function() {},
      right: function() {}
    }
  });

  const home = new Kai({
    name: 'home',
    data: {
      title: 'home',
      unit: '$',
      total_balance: 0,
      _total_balance: 0,
      total_deposit: 0,
      _total_deposit: 0,
      total_withdraw: 0,
      _total_withdraw: 0,
      sr_tb: '',
      sr_td: '',
      sr_tw: '',
    },
    verticalNavClass: '.homeNav',
    components: [],
    templateUrl: document.location.origin + '/templates/home.html',
    mounted: function() {
      this.$router.setHeaderTitle('Pocket ATM');
      this.$state.addGlobalListener(this.methods.listenState);
      this.setData({
        'unit': this.$state.getState('unit'),
        'total_balance': nFormatter(this.$state.getState('total_balance')),
        '_total_balance': this.$state.getState('total_balance').toFixed(2),
        'total_deposit': nFormatter(this.$state.getState('total_deposit')),
        '_total_deposit': this.$state.getState('total_deposit').toFixed(2),
        'total_withdraw': nFormatter(this.$state.getState('total_withdraw')),
        '_total_withdraw': this.$state.getState('total_withdraw').toFixed(2),
        'sr_tb': `Total Balance, ${this.$state.getState('unit')}, ${this.$state.getState('total_balance').toFixed(2)}`,
        'sr_td': `Total Deposit, ${this.$state.getState('unit')}, ${this.$state.getState('total_deposit').toFixed(2)}`,
        'sr_tw': `Total Withdraw, ${this.$state.getState('unit')}, ${this.$state.getState('total_withdraw').toFixed(2)}`,
      });
      const CURRENT_VERSION = window.localStorage.getItem('APP_VERSION');
      if (APP_VERSION != CURRENT_VERSION) {
        this.$router.showToast(`Updated to version ${APP_VERSION}`);
        this.$router.push('changelogs');
        window.localStorage.setItem('APP_VERSION', APP_VERSION);
        return;
      }
    },
    unmounted: function() {
      this.verticalNavIndex = -1;
      this.$state.removeGlobalListener(this.methods.listenState);
    },
    methods: {
      listenState: function(data) {
        var obj = {};
        for (var k in data) {
          const v = data[k];
          try {
            JSON.parse(v);
            obj[k] = nFormatter(v)
            obj[`_${k}`] = v.toFixed(2);
          } catch(e){
            obj[k] = v;
          }
        }
        this.setData(obj);
      },
    },
    softKeyText: { left: 'Deposit', center: 'MENU', right: 'Withdraw' },
    softKeyListener: {
      left: function() {
        commitWithdrawOrDeposit(this.$router, true);
      },
      center: function() {
        this.verticalNavIndex = -1;
        document.activeElement.classList.remove('focus');
        var menus = [
          { "text": "Transaction History" },
          { "text": "Currency Unit" },
          { "text": this.$state.getState('deficit_spending') ? "Disable Deficit Spending" : "Enable Deficit Spending" },
          { "text": "Changelogs" },
          // { "text": "Migrate to IndexDB", "subtext": `Current: ${STORAGE_TYPE === localforage.INDEXEDDB ? 'IndexDB' : 'LocalStorage'}` },
          { "text": "Exit" },
        ];
        this.$router.showOptionMenu('Menu', menus, 'Select', (selected) => {
          if (selected.text === 'Currency Unit') {
            const searchDialog = Kai.createDialog('Currency Unit', '<label class="sr-only" for="currency-input">Enter your currency unit, Left Key to Cancel, Right Key to Update,</label><div><input id="currency-input" name="currency-input" placeholder="Enter your currency unit" class="kui-input" type="text" /></div>', null, '', undefined, '', undefined, '', undefined, undefined, this.$router);
            searchDialog.mounted = () => {
              setTimeout(() => {
                setTimeout(() => {
                  this.$router.setSoftKeyText('Cancel' , '', 'Update');
                  UNIT_INPUT.focus();
                }, 103);
                const UNIT_INPUT = document.getElementById('currency-input');
                if (!UNIT_INPUT) {
                  return;
                }
                UNIT_INPUT.focus();
                UNIT_INPUT.value = this.$state.getState('unit');
                UNIT_INPUT.addEventListener('keydown', (evt) => {
                  switch (evt.key) {
                    case 'Backspace':
                    case 'EndCall':
                      if (document.activeElement.value.length === 0) {
                        this.$router.hideBottomSheet();
                        setTimeout(() => {
                          UNIT_INPUT.blur();
                        }, 100);
                      }
                      break
                    case 'SoftRight':
                      this.$router.hideBottomSheet();
                      setTimeout(() => {
                        UNIT_INPUT.blur();
                        this.$state.setState('unit', UNIT_INPUT.value);
                        localforage.setItem('__unit__', UNIT_INPUT.value);
                      }, 100);
                      break
                    case 'SoftLeft':
                      this.$router.hideBottomSheet();
                      setTimeout(() => {
                        UNIT_INPUT.blur();
                      }, 100);
                      break
                  }
                });
              });
            }
            searchDialog.dPadNavListener = {
              arrowUp: function() {
                const UNIT_INPUT = document.getElementById('currency-input');
                UNIT_INPUT.focus();
              },
              arrowDown: function() {
                const UNIT_INPUT = document.getElementById('currency-input');
                UNIT_INPUT.focus();
              }
            }
            this.$router.showBottomSheet(searchDialog);
          } else if (selected.text === 'Transaction History') {
            this.$router.push('transaction_logs');
          } else if (selected.text === 'Enable Deficit Spending' || selected.text === 'Disable Deficit Spending') {
            const val = !this.$state.getState('deficit_spending');
            this.$state.setState('deficit_spending', val);
            localforage.setItem('__deficit_spending__', val);
          } else if (selected.text === 'Changelogs') {
            this.$router.push('changelogs');
          } else if (selected.text === "Migrate to IndexDB") {
            // '__deficit_spending__'
            // '__unit__'
            // '__logs__'
          } else if (selected.text === 'Exit') {
            pushLocalNotification(`App was closed`);
            window.close();
          }
        }, () => {
          const main = this.$router.stack[app.$router.stack.length - 1];
          if (main.name === 'home') {
            this.navigateListNav(1);
          }
        });
      },
      right: function() {
        commitWithdrawOrDeposit(this.$router, false);
      }
    },
    dPadNavListener: {
      arrowUp: function() {
        this.navigateListNav(-1);
      },
      arrowRight: function() {
        // this.navigateTabNav(-1);
      },
      arrowDown: function() {
        this.navigateListNav(1);
      },
      arrowLeft: function() {
        // this.navigateTabNav(1);
      }
    },
    backKeyListener: function() {
      if (document.activeElement) {
        document.activeElement.classList.remove('focus');
        this.verticalNavIndex = -1;
      }
    }
  });

  const router = new KaiRouter({
    title: 'KaiKit',
    routes: {
      'index' : {
        name: 'home',
        component: home
      },
      'transaction_logs' : {
        name: 'transaction_logs',
        component: transaction_logs
      },
      'changelogs' : {
        name: 'changelogs',
        component: changelogs
      }
    }
  });

  const app = new Kai({
    name: '_APP_',
    data: {},
    templateUrl: document.location.origin + '/templates/template.html',
    mounted: function() {},
    unmounted: function() {},
    router,
    state
  });

  try {
    app.mount('app');
  } catch(e) {
    console.log(e);
  }

  function displayKaiAds() {
    var display = true;
    if (window['kaiadstimer'] == null) {
      window['kaiadstimer'] = new Date();
    } else {
      var now = new Date();
      if ((now - window['kaiadstimer']) < 300000) {
        display = false;
      } else {
        window['kaiadstimer'] = now;
      }
    }
    console.log('Display Ads:', display);
    if (!display)
      return;
    getKaiAd({
      publisher: 'ac3140f7-08d6-46d9-aa6f-d861720fba66',
      app: 'pocket-atm',
      slot: 'kaios',
      onerror: err => console.error(err),
      onready: ad => {
        if (document.activeElement) {
          document.activeElement.classList.remove('focus');
        }
        ad.call('display');
        ad.on('close', () => {
          document.body.style.position = '';
          const screen = app.$router.stack[app.$router.stack.length - 1];
          if (screen) {
            screen.verticalNavIndex = -1;
            setTimeout(() => {
              screen.navigateListNav(1);
            }, 200);
          }
        });
        ad.on('display', () => {
          document.body.style.position = '';
          pushLocalNotification('Ads was displayed. press Left key to close');
        });
      }
    })
  }

  displayKaiAds();

  document.addEventListener('visibilitychange', function(ev) {
    if (document.visibilityState === 'visible') {
      const main = app.$router.stack[app.$router.stack.length - 1];
      if (main.name === 'home') {
        if (main.verticalNavIndex === -1) {
          main.navigateListNav(1);
          displayKaiAds();
        }
      }
    }
  });

});
