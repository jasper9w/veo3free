# -*- coding: utf-8 -*-

from __future__ import unicode_literals

import math
import time
import json
import uuid
import logging
import threading

import requests

from hashlib import md5
from functools import partial

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s.%(msecs)03d %(levelname)s %(module)s - %(funcName)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger('PJYSDK')


class DotDict(dict):
    def __getattr__(self, attr):
        v = self.get(attr, None)
        if isinstance(v, dict):
            return DotDict(v)
        return v

    __setattr__ = dict.__setitem__

    __delattr__ = dict.__delitem__


class IntervalThread(threading.Thread):
    def __init__(self, target, interval=60, *args, **kwargs):
        super(IntervalThread, self).__init__(target=target, *args, **kwargs)
        self._stop_event = threading.Event()
        self._interval = interval

    def stop(self):
        self._stop_event.set()

    def stopped(self):
        return self._stop_event.is_set()
    
    def run(self):
        while True:
            self._target(*self._args, **self._kwargs)
            is_stop = self._stop_event.wait(self._interval)
            if is_stop:
                break


class PJYSDK(object):
    def __init__(self, app_key, app_secret):
        self.debug = True
        self._lib_version = 'v1.0.7'
        self._protocol = 'http'
        self._hosts = ['api3.paojiaoyun.com', 'api6.paojiaoyun.com', 'api.paojiaoyun.com', 'api2.paojiaoyun.com']
        self._host = self._hosts[0]
        self._device_id = ''
        self._retry_count = 9
        self._switch_count = 0
        self._timeout = 5
        
        self._app_key = app_key
        self._app_secret = app_secret
        
        self._card = ''
        self._username = ''
        self._password = ''
        self._token = None
        
        self.is_trial = False  # 是否是试用用户
        self.login_result = DotDict(
            card_type='',
            expires='',
            expires_ts=0,
            config='',
        )

        self._auto_heartbeat = True  # 是否自动开启心跳任务
        self._heartbeat_gap = 10*60  # 默认10分钟
        self._heartbeat_task = None
        self._heartbeat_ret = DotDict({'code': -9, 'message': u'还未开始验证'})
        self.on_heartbeat_failed = lambda ret: print(ret.message)  # 心跳失败回调函数 自定义

        self._prev_nonce = None
        self._is_ping = False
    
    def switch_host(self):
        self._switch_count += 1
        self._host = self._hosts[self._switch_count % len(self._hosts)]
    
    @staticmethod
    def timestamp():
        try:
            ret = requests.get('https://tptm.hd.mi.com/gettimestamp', timeout=5)
            data = ret.content
            return int(data.replace('var servertime=', '')) - 3
        except Exception:
            try:
                ret = requests.get('https://api.pinduoduo.com/api/server/_stm', timeout=5)
                data = ret.json()
                return math.floor(data['server_time'] / 1000) - 3
            except Exception:
                return int(time.time()) - 3

    @staticmethod
    def _draw_cc_params(body):
        if not body:
            return ""
        start = body.find('?')
        if start < 0:
            return ""
        end = body.find('";')
        if end < 0 or end < start:
            return ""
        return body[start:end]
    
    def ping(self):
        if self._is_ping:
            return
        try:
            path = "/v1/ping"
            url = f'{self._protocol}://{self._host}{path}'
            ret = requests.get(url, timeout=self._timeout)
            if ret.text == "Pong":
                logger.info("api连接成功")
                self._is_ping = True
                return
            
            params = self._draw_cc_params(ret.text)
            if not params:
                self.switch_host()
            
            ret2 = requests.get(url + params, timeout=self._timeout)
            if ret2.text != "Pong":
                self.switch_host()
                return
            
            logger.info("api连接成功")
            self._is_ping = True
        except Exception as e:
            self.switch_host()

    @staticmethod
    def retry_fib(num):
        if num > 5:
            return 55
        a, b = 3, 5
        for i in range(0, num):
            tmp = a + b
            a = b
            b = tmp
        return a

    @staticmethod
    def join_params(data):
        ret = []
        for k, v in data.items():
            ret.append(f'{k}={v}')
        ret = sorted(ret)
        return '&'.join(ret)

    def _heartbeat_task_func(self, heartbeat_func):  # 心跳多线程任务
        self._heartbeat_ret = heartbeat_func()
        if self._heartbeat_ret.code != 0:
            self.on_heartbeat_failed(self._heartbeat_ret)

    def _start_heartbeat(self, heartbeat_func):  # 开启心跳多线程
        if self._heartbeat_task:
            self._heartbeat_task.stop()
            self._heartbeat_task = None
        self._heartbeat_task = IntervalThread(
            target=partial(self._heartbeat_task_func, heartbeat_func), interval=self._heartbeat_gap)
        self._heartbeat_task.start()
    
    def _stop_heartbeat_task(self):
        if self._heartbeat_task:
            self._heartbeat_task.stop()
            self._heartbeat_task = None
        self._heartbeat_ret = DotDict({'code': -9, 'message': u'还未开始验证'})
    
    def _debug(self, method, path, params, result):
        if self.debug:
            logger.info(f'\n{method} - {path}:\nparams: {json.dumps(params, indent=4, ensure_ascii=False)}\n'
                        f'result: {json.dumps(result, indent=4, ensure_ascii=False)}')

    def check_resp_sign(self, resp):
        if resp.code != 0 and resp.nonce == '' and resp.sign == '':
            return resp
        ps = ''
        if resp.result:
            ps = self.join_params(resp.result)

        s = f'{resp.code}{resp.message}{ps}{resp.nonce}{self._app_secret}'
        sign = md5(s.encode()).hexdigest()
        if sign == resp.sign:
            if self._prev_nonce is None:
                self._prev_nonce = resp.nonce
                return DotDict({'code': 0, 'message': u'OK'})
            elif resp.nonce > self._prev_nonce:
                self._prev_nonce = resp.nonce
                return DotDict({'code': 0, 'message': u'OK'})
            else:
                return DotDict({'code': -98, 'message': u'CRS:nonce校验失败'})

        return DotDict({'code': -99, 'message': u'CRS:签名校验失败'})

    def request(self, method, path, params):
        self.ping()
        
        params['app_key'] = self._app_key
        method = method.upper()
        max_retries = self._retry_count
        retries_count = 0
        
        while retries_count < max_retries:
            url = f'{self._protocol}://{self._host}{path}'
            retries_count += 1
            sec = self.retry_fib(retries_count)
            
            if 'sign' in params:
                del params['sign']
            params['nonce'] = str(uuid.uuid4())
            params['timestamp'] = self.timestamp()
            ps = self.join_params(params)
            s = method + self._host + path + ps + self._app_secret
            sign = md5(s.encode()).hexdigest()
            params['sign'] = sign
            
            try:
                if method.upper() == 'GET':
                    resp = requests.get(url, params, timeout=self._timeout)
                else:
                    resp = requests.post(url, json=params, timeout=self._timeout)
                body = resp.content
                data = DotDict(json.loads(body))
                self._debug(method, path, params, data)
                
                crs = self.check_resp_sign(data)
                if crs.code != 0:
                    return crs
                return data
            except Exception as e:
                if self.debug:
                    logger.warning(f'[*] request error: {type(e)} {e}; {sec}s后重试', )
                self.switch_host()
                time.sleep(sec)

        return DotDict({'code': -1, 'message': u'连接服务器失败'})
    
    def set_device_id(self, device_id):
        self._device_id = device_id.strip()

    def set_card(self, card):
        self._card = card.strip()
    
    def set_user(self, username, password):
        self._username = username.strip()
        self._password = password.strip()
    
    # 通用 #
    
    def get_heartbeat_result(self):
        return self._heartbeat_ret
    
    def get_time_remaining(self):
        g = self.login_result.expires_ts - self.timestamp()
        return 0 if g < 0 else g

    # 卡密相关 #
    
    def card_login(self):  # 卡密登录
        if self._card in (None, ''):
            return {'code': -4, 'message': u'请先设置卡密'}
        if self._device_id in (None, ''):
            return DotDict({'code': -5, 'message': u'请先设置设备号'})
        
        method = 'POST'
        path = '/v1/card/login'
        data = {'card': self._card, 'device_id': self._device_id}
        ret = self.request(method, path, data)
        if ret.code == 0:
            self._token = ret.result.token
            self.login_result = ret.result
            self._heartbeat_gap = ret.result.hg
            if self._auto_heartbeat:
                self._start_heartbeat(self.card_heartbeat)
        return ret

    def card_heartbeat(self):  # 卡密心跳
        if self._token in (None, ''):
            return DotDict({'code': -2, 'message': u'请在卡密登录成功后调用'})
        
        method = 'POST'
        path = '/v1/card/heartbeat'
        data = {'card': self._card, 'token': self._token}
        ret = self.request(method, path, data)
        if ret.code == 0:
            self.login_result.expires = ret.result.expires
            self.login_result.expires_ts = ret.result.expires_ts
        return ret
    
    def card_logout(self):  # 卡密退出登录
        self._stop_heartbeat_task()
        if self._token in (None, ''):
            return DotDict({'code': 0, 'message': u'OK'})
        method = 'POST'
        path = '/v1/card/logout'
        data = {'card': self._card, 'token': self._token}
        ret = self.request(method, path, data)
        # 清理
        self._token = None
        self.login_result = DotDict({
            'card_type': '',
            'expires': '',
            'expires_ts': 0,
            'config': '',
        })
        return ret

    def card_unbind_device(self):  # 卡密解绑设备，需开发者后台配置
        if self._token in (None, ''):
            return DotDict({'code': -2, 'message': u'请在卡密登录成功后调用'})
        method = 'POST'
        path = '/v1/card/unbind_device'
        data = {'card': self._card, 'device_id': self._device_id, 'token': self._token}
        return self.request(method, path, data)

    def set_card_unbind_password(self, password):  # 自定义设置解绑密码
        if self._token in (None, ''):
            return DotDict({'code': -2, 'message': u'请在卡密登录成功后调用'})
        method = 'POST'
        path = '/v1/card/unbind_password'
        data = {'card': self._card, 'password': password, 'token': self._token}
        return self.request(method, path, data)

    def card_unbind_device_by_password(self, password):  # 用户通过解绑密码解绑设备
        method = 'POST'
        path = '/v1/card/unbind_device/by_password'
        data = {'card': self._card, 'password': password}
        return self.request(method, path, data)

    def card_recharge(self, card, use_card):  # 以卡充卡
        method = 'POST'
        path = '/v1/card/recharge'
        data = {'card': card, 'use_card': use_card}
        return self.request(method, path, data)

    # 用户相关 #
    
    def user_register(self, username, password, card):  # 用户注册（通过卡密）
        if self._device_id in (None, ''):
            return DotDict({'code': -5, 'message': u'请先设置设备号'})
        method = 'POST'
        path = '/v1/user/register'
        data = {'username': username, 'password': password, 'card': card, 'device_id': self._device_id}
        return self.request(method, path, data)

    def user_login(self):  # 用户账号登录
        if not self._username or not self._password:
            return DotDict({'code': -4, 'message': u'请先设置用户账号密码'})
        if self._device_id in (None, ''):
            return DotDict({'code': -5, 'message': u'请先设置设备号'})
        method = 'POST'
        path = '/v1/user/login'
        data = {'username': self._username, 'password': self._password, 'device_id': self._device_id}
        ret = self.request(method, path, data)
        if ret.code == 0:
            self._token = ret.result.token
            self.login_result = ret.result
            self._heartbeat_gap = ret.result.hg
            if self._auto_heartbeat:
                self._start_heartbeat(self.user_heartbeat)
        return ret

    def user_heartbeat(self):  # 用户心跳，默认会自动开启
        if self._token in (None, ''):
            return DotDict({'code': -2, 'message': u'请在卡密登录成功后调用'})
        method = 'POST'
        path = '/v1/user/heartbeat'
        data = {'username': self._username, 'token': self._token}
        ret = self.request(method, path, data)
        if ret.code == 0:
            self.login_result.expires = ret.result.expires
            self.login_result.expires_ts = ret.result.expires_ts
        return ret

    def user_logout(self):  # 用户退出登录
        self._stop_heartbeat_task()
        if self._token in (None, ''):
            return DotDict({'code': 0, 'message': u'OK'})
        method = 'POST'
        path = '/v1/user/logout'
        data = {'username': self._username, 'token': self._token}
        ret = self.request(method, path, data)
        # 清理
        self._token = None
        self.login_result = DotDict({
            'card_type': '',
            'expires': '',
            'expires_ts': 0,
            'config': '',
        })
        return ret

    def user_change_password(self, username, password, new_password):  # 用户修改密码
        method = 'POST'
        path = '/v1/user/password'
        data = {'username': username, 'password': password, 'new_password': new_password}
        return self.request(method, path, data)
    
    def user_recharge(self, username, card):  # 用户通过卡密充值
        method = 'POST'
        path = '/v1/user/recharge'
        data = {'username': username, 'card': card}
        return self.request(method, path, data)
    
    def user_unbind_device(self):  # 用户解绑设备，需开发者后台配置
        if self._token in (None, ''):
            return DotDict({'code': -2, 'message': u'请在卡密登录成功后调用'})
        method = 'POST'
        path = '/v1/user/unbind_device'
        data = {'username': self._username, 'device_id': self._device_id, 'token': self._token}
        return self.request(method, path, data)

    # 配置相关 #
    
    def get_card_config(self):  # 获取卡密配置
        method = 'GET'
        path = '/v1/card/config'
        data = {'card': self._card}
        return self.request(method, path, data)
    
    def update_card_config(self, config):  # 更新卡密配置
        method = 'POST'
        path = '/v1/card/config'
        data = {'card': self._card, 'config': config}
        return self.request(method, path, data)
    
    def get_user_config(self):  # 获取用户配置
        method = 'GET'
        path = '/v1/user/config'
        data = {'user': self._username}
        return self.request(method, path, data)
    
    def update_user_config(self, config):  # 更新用户配置
        method = 'POST'
        path = '/v1/user/config'
        data = {'username': self._username, 'config': config}
        return self.request(method, path, data)
    
    # 软件相关 #
    
    def get_software_config(self):  # 获取软件配置
        method = 'GET'
        path = '/v1/software/config'
        return self.request(method, path, {})
    
    def get_software_notice(self):  # 获取软件通知
        method = 'GET'
        path = '/v1/software/notice'
        return self.request(method, path, {})
    
    def get_software_latest_version(self, current_ver):  # 获取软件最新版本
        method = 'GET'
        path = '/v1/software/latest_ver'
        data = {'version': current_ver}
        return self.request(method, path, data)
    
    # 试用功能 #
    
    def trial_login(self):
        if self._device_id in (None, ''):
            return DotDict({'code': -5, 'message': u'请先设置设备号'})
        method = 'POST'
        path = '/v1/trial/login'
        data = {'device_id': self._device_id}
        ret = self.request(method, path, data)
        if ret.code == 0:
            self.is_trial = True
            self._token = ret.result.token
            self.login_result = ret.result
            self._heartbeat_gap = ret.result.hg
            if self._auto_heartbeat:
                self._start_heartbeat(self.trial_heartbeat)
        return ret

    def trial_heartbeat(self):
        method = 'POST'
        path = '/v1/trial/heartbeat'
        data = {'device_id': self._device_id}
        ret = self.request(method, path, data)
        if ret.code == 0:
            self.login_result.expires = ret.result.expires
            self.login_result.expires_ts = ret.result.expires_ts
        return ret
    
    def trial_logout(self):  # 试用退出登录，没有http请求，只是清理本地记录
        self.is_trial = False
        self._stop_heartbeat_task()
        # 清理
        self._token = None
        self.login_result = DotDict({
            'card_type': '',
            'expires': '',
            'expires_ts': 0,
            'config': '',
        })
        return DotDict({'code': 0, 'message': u'OK'})

    # 高级功能 #
    
    def get_remote_var(self, key):  # 获取远程变量
        method = 'GET'
        path = '/v1/af/remote_var'
        data = {'key': key}
        if self._card not in [None, '']:
            data['card'] = self._card
        if self._token not in [None, '']:
            data['token'] = self._token
        return self.request(method, path, data)
    
    def get_remote_data(self, key):  # 获取远程数据
        method = 'GET'
        path = '/v1/af/remote_data'
        data = {'key': key}
        return self.request(method, path, data)
    
    def create_remote_data(self, key, value):  # 创建远程数据
        method = 'POST'
        path = '/v1/af/remote_data'
        data = {'action': 'create', 'key': key, 'value': value}
        return self.request(method, path, data)
    
    def update_remote_data(self, key, value):  # 修改远程数据
        method = 'POST'
        path = '/v1/af/remote_data'
        data = {'action': 'update', 'key': key, 'value': value}
        return self.request(method, path, data)
    
    def delete_remote_data(self, key):  # 删除远程数据
        method = 'POST'
        path = '/v1/af/remote_data'
        data = {'action': 'delete', 'key': key}
        return self.request(method, path, data)

    def call_remote_func(self, func_name, params):  # 执行远程函数
        method = 'POST'
        path = '/v1/af/call_remote_func'
        ps = json.dumps(params)
        data = {'func_name': func_name, 'params': ps}
        ret = self.request(method, path, data)
        if ret.code == 0 and ret.result['return']:
            ret.result = json.loads(ret.result['return'])
        return ret
