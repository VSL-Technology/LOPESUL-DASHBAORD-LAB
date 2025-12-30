const ADDRESS_LIST = process.env.RELAY_PAID_LIST || 'paid_clients';
const HOTSPOT_SERVER = process.env.RELAY_HOTSPOT_SERVER || 'hotspot1';

export function buildAuthorizeCommands({ ip, mac, username, comment, resync }) {
  const commands = [];

  if (resync) {
    commands.push(...buildRemovalCommands({ ip, mac, username }));
  }

  if (ip) {
    commands.push(
      `/ip/firewall/address-list/add list=${ADDRESS_LIST} address=${ip} comment="${comment}"`
    );
  }

  if (mac) {
    const addressPart = ip ? ` address=${ip}` : '';
    commands.push(
      `/ip/hotspot/ip-binding/add mac-address=${mac}${addressPart} type=bypassed server=${HOTSPOT_SERVER} comment="${comment}"`
    );
  }

  if (username) {
    commands.push(
      `/ip/hotspot/user/add name=${username} password=${username} comment="${comment}"`
    );
  }

  return commands;
}

export function buildRemovalCommands({ ip, mac, username }) {
  const commands = [];

  if (ip) {
    commands.push(
      `/ip/firewall/address-list/remove [find list=${ADDRESS_LIST} address=${ip}]`
    );
  }

  if (mac) {
    commands.push(
      `/ip/hotspot/ip-binding/remove [find mac-address=${mac}]`
    );
    commands.push(
      `/interface/wireless/access-list/remove [find mac-address=${mac}]`
    );
  }

  if (username) {
    commands.push(
      `/ip/hotspot/user/remove [find name=${username}]`
    );
  }

  return commands;
}
