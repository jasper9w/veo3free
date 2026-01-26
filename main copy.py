from PJYSDK import *
import os
import time

# 文档：https://docs.paojiaoyun.com/py_sdk.html

# 初始化 app_key 和 app_secret 在开发者后台新建软件获取
pjysdk = PJYSDK(app_key='bnsekoso6itblafodqe6', app_secret='m3p0lkODcCUpyf3o6DkktAQSJqqLygeV')
pjysdk.debug = True


# 心跳失败回调
def on_heartbeat_failed(hret):
    print(hret.message)
    if hret.code == 10214:
        os._exit(1)  # 退出脚本
    print("心跳失败，尝试重登...")
    login_ret = pjysdk.card_login()
    if login_ret.code == 0:
        print("重登成功")
    else:
        print(login_ret.message)  # 重登失败
        os._exit(1)  # 退出脚本


if __name__ == '__main__':
    pjysdk.on_heartbeat_failed = on_heartbeat_failed
    pjysdk.set_device_id('123')  # 设置设备唯一ID
    pjysdk.set_card('IWPSJKeEeMaHb7dXZVVSb42SLUUWIPAMBHaAWKLO')  # 设置卡密
    
    ret = pjysdk.card_login()  # 卡密登录
    if ret.code != 0:  # 登录失败
        print(ret.message)
        os._exit(1)  # 退出脚本
    
    # 登录成功，后面写你的业务代码
    while 1:  # 测试用，hold住主线程不要退出，记得删除，后面应该是你的代码了
        print(pjysdk.get_time_remaining())
        time.sleep(5)
