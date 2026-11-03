// Deals the solver won, for "Winnable" games and the daily deal: seeds of deal() in base 36, by the number of
// suits. Written by dev/deals.mjs and checked by dev/check-deals.mjs; do not edit by hand.
export const DEALS = {
  1:
    "17wdrqp grnhia 1oo198z xjaz0k 6ekos5 1eaygiu n686af 1v2ly14 13xvnsp ct5dka 1kpj5az tksv2k 2g2ku5 " +
    "1acgcku j7q2cf 1r43u34 zzdjup 8un9ma 1gr11cz pmar4k 1xioiv9 16dy8mu f97yef 1n5lq54 w0vfwp 4w55oa " +
    "1csixez lnsn6k 1tk6ex9 12fg4ou bapugf 1j73m74 s2dbyp xn1qa 18u0tgz hpaj8k 1ploaz9 ygy0qu 7c7qif " +
    "1f8li94 o3v80p 1w08zre 14vipiz dqsfak 1ln6719 uifwsu 3dpmkf 1ba3eb4 k5d42p 1s1qvte 10x0lkz 9sabck " +
    "1hoo339 qjxsuu 1ygbklj 17blad4 g6v04p 1o38rve wyihmz 5ts7ek 1dq5z59 mlfowu 1uhtgnj 13d36f4 c8cw6p " +
    "1k4qnxe t00doz 1va3gk 19rnv79 imxkyu 1qjbcpj zel2h4 89us8p 1g68jze p1i9qz 1wxw1ho 15t5r99 eofh0u " +
    "1mkt8rj vg2yj4 4bcoap 1c7qg1e l305sz 1szdxjo 11unnb9 apxd2u 1imb4tj rhkul4 cukcp 1898c3e h4i1uz " +
    "1p0vtlo xw5jd9 6rf94u 1ent0vj nj2qn4 1vfgidt 14aq85e d5zxwz 1l2dpno txnff9 2sx56u 1apawxj jkkmp4 " +
    "1rgyeft 10c847e 97htyz 1h3vlpo pz5bh9 1xvj37y 16qsszj fm2ir4 1nigaht wdq09e 58zq0z 1d5dhro m0n7j9 " +
    "12sap1j bnket4 1jjy6jt sf7wbe 1ahm2z 196vdto i253l9 1pyivby ytsl3j 7p2av4 1flg2lt ogpsde 1wd3k43 " +
    "158d9vo e3mzn9 1m00rdy uvah5j 3qk6x4 1bmxynt ki7ofe 1selg63 119v5xo a54vp9 1i1infy qwsd7j 1yt64y8 " +
    "17ofupt gjpkhe 1og3c83 xbd1zo 66mrr9 1e30jhy mya99j 1uuo108 13pxqrt cl7gje 1khl8a3 tcuy1o 284nt9 " +
    "1a4ifjy izs5bj 1qw5x28 zrfmtt 8mpcle 1gj34c3 pecu3o 1xaqlud 1660bly f1a1dj 1mxnt48 vsxivt 4o78ne " +
    "1ckl0e3 lfuq5o 1tc8hwd 127i7ny 1iz5p68 rufext pp4pe 18m2wg3 hhcm7o 1pdqdyd y903py 749thj 1f0nl88 " +
    "nvxazt 1vsb2qi 14nksi3 1lf8a0d uahzry 35rpjj 1b25ha8 jxf71t 1rtsysi 10p2ok3 9kcebo 1hgq62d qbzvty " +
    "1y8dnkn 173ndc8 fyx33t 1nvauui wqkkm3 5luado 1di824d mdhrvy 13559e8 c0ez5t 1jwsqwi ss2go3 1nc6fo " +
    "19jpy6d ieznxy 1qbdfon z6n5g8 81wv7t 1fyamyi otkcq3 1wpy4gs 15l7u8d eghjzy 1mcvbqn v851i8 43er9t " +
    "1bzsj0i kv28s3 1srg0is 11mpqad ahzg1y 1ied7sn r9mxk8 4wnbt 181af2i gwk4u3 1osxwks xo7mcd 6jhc3y " +
    "1efv3un nb4tm8 1v7ilcx 142sb4i cy20w3 1kufsms tppied 2kz85y 1ahczwn jcmpo8 1r90hex 104a76i 8zjwy3 " +
    "1gvxoos pr7egd 1xnl672 16iuvyn fe4lq8 1naidgx w5s38i 511t03 1cxfkqs lspaid 1tp3292 12kcs0n bfmhs8 " +
    "1jc09ix s79zai 12jp23 18yxgss hu76kd 1pqkyb2 yluo2n 7h4du8 1fdi5kx o8rvci 1w55n37 150fcus dvp2md " +
    "1ls2ud2 unck4n 3im9w8 1bf01mx ka9rei 1s6nj57 111x8ws 9x6yod 1htkqf2 qoug6n 1yl87xc 17ghxox gbrngi " +
    "1o85f77 x3f4ys 5youqd 1dv2mh2 mqcc8n 1umq3zc 13hztqx cd9jii 1k9nb97 t4x10s 206qsd 19wkij2 iru8an " +
    "1qo801c ",
  2:
    "17wdrqp grnhia 1oo198z xjaz0k 6ekos5 n686af 1v2ly14 13xvnsp ct5dka 1kpj5az tksv2k 2g2ku5 1acgcku " +
    "j7q2cf 1r43u34 zzdjup 8un9ma 1gr11cz pmar4k 1xioiv9 16dy8mu f97yef w0vfwp 4w55oa lnsn6k 1tk6ex9 " +
    "bapugf 1j73m74 xn1qa 18u0tgz 1ploaz9 ygy0qu 7c7qif 1f8li94 1w08zre 14vipiz dqsfak 1ln6719 uifwsu " +
    "3dpmkf 1ba3eb4 k5d42p 1s1qvte 10x0lkz 9sabck 1hoo339 qjxsuu 1ygbklj 17blad4 g6v04p 1o38rve wyihmz " +
    "5ts7ek 1dq5z59 mlfowu 1uhtgnj 13d36f4 c8cw6p 1k4qnxe t00doz 1va3gk imxkyu 1qjbcpj zel2h4 1g68jze " +
    "1wxw1ho 15t5r99 eofh0u vg2yj4 1c7qg1e l305sz 1szdxjo 11unnb9 apxd2u 1imb4tj rhkul4 cukcp 1898c3e " +
    "h4i1uz 1p0vtlo xw5jd9 6rf94u 1ent0vj nj2qn4 1vfgidt d5zxwz 1l2dpno txnff9 2sx56u 1apawxj jkkmp4 " +
    "1rgyeft 10c847e 97htyz 1h3vlpo pz5bh9 fm2ir4 1nigaht wdq09e 58zq0z m0n7j9 1tx0z9y 12sap1j bnket4 " +
    "1jjy6jt sf7wbe 1ahm2z 196vdto i253l9 1pyivby ytsl3j 1flg2lt ogpsde 158d9vo e3mzn9 1m00rdy uvah5j " +
    "3qk6x4 1bmxynt 1selg63 119v5xo a54vp9 1i1infy 1yt64y8 17ofupt 1og3c83 xbd1zo 66mrr9 1e30jhy mya99j " +
    "1uuo108 cl7gje 1khl8a3 284nt9 1a4ifjy izs5bj zrfmtt 8mpcle pecu3o 1xaqlud f1a1dj 4o78ne lfuq5o " +
    "1tc8hwd 127i7ny b2rxfj 1iz5p68 rufext pp4pe 18m2wg3 hhcm7o 1pdqdyd y903py 749thj 1f0nl88 nvxazt " +
    "1vsb2qi diui9o 1lf8a0d uahzry 35rpjj 1b25ha8 jxf71t 1rtsysi 10p2ok3 1hgq62d qbzvty 1y8dnkn fyx33t " +
    "1nvauui wqkkm3 5luado 1di824d mdhrvy 1u9vjmn 13559e8 c0ez5t 1jwsqwi ss2go3 1nc6fo 19jpy6d ieznxy " +
    "z6n5g8 1fyamyi 1wpy4gs 15l7u8d eghjzy 1mcvbqn v851i8 43er9t 1bzsj0i kv28s3 1srg0is 11mpqad 1ied7sn " +
    "r9mxk8 4wnbt 181af2i 1osxwks xo7mcd 6jhc3y 1efv3un nb4tm8 1v7ilcx cy20w3 1kufsms tppied 2kz85y " +
    "jcmpo8 104a76i 8zjwy3 1gvxoos 16iuvyn fe4lq8 1naidgx w5s38i 511t03 1cxfkqs 12kcs0n bfmhs8 1jc09ix " +
    "s79zai 12jp23 18yxgss hu76kd yluo2n 7h4du8 1fdi5kx 150fcus 1ls2ud2 unck4n 3im9w8 1bf01mx ka9rei " +
    "1s6nj57 111x8ws 9x6yod qoug6n 1yl87xc 17ghxox 1o85f77 x3f4ys 5youqd 1dv2mh2 mqcc8n 1umq3zc cd9jii " +
    "1k9nb97 t4x10s 19wkij2 ",
  4:
    "6ekos5 ct5dka 1acgcku 1gr11cz 1n5lq54 ygy0qu 1f8li94 1w08zre 14vipiz 1ln6719 1ba3eb4 k5d42p 1s1qvte " +
    "10x0lkz 1hoo339 1ygbklj 17blad4 g6v04p 1uhtgnj 13d36f4 1k4qnxe 1va3gk 1wxw1ho eofh0u 1szdxjo 6rf94u " +
    "1ent0vj 14aq85e 10c847e 1h3vlpo 1d5dhro m0n7j9 1ahm2z ytsl3j 1selg63 17ofupt 1og3c83 xbd1zo mya99j " +
    "284nt9 izs5bj zrfmtt 1660bly 1ckl0e3 lfuq5o 1tc8hwd uahzry 35rpjj jxf71t 1hgq62d fyx33t ss2go3 " +
    "ieznxy 1wpy4gs 1mcvbqn 1bzsj0i kv28s3 1srg0is 11mpqad 142sb4i cy20w3 104a76i 16iuvyn 511t03 12kcs0n " +
    "12jp23 18yxgss 7h4du8 150fcus 1ls2ud2 111x8ws 17ghxox 1o85f77 x3f4ys 1k9nb97 zjhpsx vkzlux 1ir7s5c " +
    "1vkd5pm 9cehas 1y0fqjr wimnl7 5dwdcs 1u1xmlr 1joutvm yyp8fc 15d9x7h 17tci1m 1a9f2vr 1r12ke1 pj9hfh " +
    "1xfn966 16awyxr f66opc vxu67m 4t3vz7 lkrdhh b7okrc 1j42ci1 1pin1a6 1ydaawg wvh7xw 1dn4pg6 1ues6yg " +
    "1k1pe8b ijwb9r ele7br 1c4p6cb kzyw3w 1swcnul 18672eb h1gs5w ng1gy1 147oygb jhjd01 94gk9w lxlxu6 " +
    "12p9fcg 17gcdw 193u44l hz3tw6 kf6eqb ci66ub 1a1h5uv pbbkel rre58q mnv0b hebcil 14kjit0 9hb4ml wnjax0 " +
    "5it0ol 1jtrh7f ibye8v v53rt5 1bwr9bf 1opwmvp 1ectu5k n83jx5 1v4hbnu 13zr1ff 1kreixp tmo8pa po64ra " +
    "16ftm9k fb3c15 w2qtjf 4y0jb0 bcl835 7e3455 ",
};
